<script setup>
import { reactive, shallowRef, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import ImageCropper from '@/features/profile/components/ImageCropper.vue'

const router = useRouter()
const { authFetch } = useApi()

const form = reactive({
  title: '',
  location: '',
  start: '',
  end: '',
  visibility: 'Public',
  joinMode: 'Open',
  capacity: ''
})

const submitting = shallowRef(false)
const error = shallowRef(null)
const submitted = shallowRef(false)

// Event image
const selectedFile = ref(null)
const croppedBlob = ref(null)
const previewUrl = ref(null)

watch(() => form.visibility, (v) => {
  if (v === 'Unlisted') form.joinMode = 'InviteOnly'
})

/** Earliest selectable datetime (start of today, so 15-min steps align to :00/:15/:30/:45). */
const nowLocal = computed(() => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`
})

/** End picker cannot be earlier than the chosen start. */
const minEnd = computed(() => form.start || nowLocal.value)

const isValid = computed(() =>
  form.title.trim().length > 0 &&
  form.location.trim().length > 0 &&
  form.start &&
  form.end &&
  new Date(form.start) > new Date() &&
  new Date(form.end) > new Date(form.start) &&
  (form.capacity === '' || (Number.isInteger(Number(form.capacity)) && Number(form.capacity) >= 1))
)

const fieldErrors = computed(() => {
  if (!submitted.value) return {}
  const errs = {}
  if (!form.title.trim()) errs.title = 'Title is required.'
  if (!form.location.trim()) errs.location = 'Location is required.'
  if (!form.start) errs.start = 'Start date is required.'
  else if (new Date(form.start) <= new Date()) errs.start = 'Start must be in the future.'
  if (!form.end) errs.end = 'End date is required.'
  else if (form.start && new Date(form.end) <= new Date(form.start)) errs.end = 'End must be after start.'
  if (form.capacity !== '' && (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1))
    errs.capacity = 'Capacity must be at least 1.'
  return errs
})

function onFileChange(event) {
  const file = event.target.files?.[0]
  if (file) selectedFile.value = file
  event.target.value = ''
}

function onCrop(blob) {
  selectedFile.value = null
  croppedBlob.value = blob
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(blob)
}

function onCancelCrop() {
  selectedFile.value = null
}

function removeImage() {
  croppedBlob.value = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

async function submit() {
  submitted.value = true
  if (!isValid.value) return

  submitting.value = true
  error.value = null

  try {
    const body = {
      title: form.title.trim(),
      location: form.location.trim(),
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      visibility: form.visibility === 'Public' ? 0 : 1,
      joinMode: form.joinMode === 'Open' ? 0 : 1,
      capacity: form.capacity ? Number(form.capacity) : null
    }

    const res = await authFetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()

    if (croppedBlob.value && data.id) {
      const formData = new FormData()
      formData.append('picture', croppedBlob.value, 'event.jpg')
      await authFetch(`/api/events/${data.id}/picture`, {
        method: 'POST',
        body: formData
      })
    }

    router.push({ name: 'home' })
  } catch (err) {
    error.value = err.message || 'Failed to create event.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form @submit.prevent="submit" class="space-y-5">
    <div>
      <label for="title" class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-400">*</span></label>
      <input
        id="title"
        data-testid="event-title-input"
        v-model="form.title"
        type="text"
        required
        :class="['w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-indigo-500', fieldErrors.title ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']"
        placeholder="Event title"
      />
      <p v-if="fieldErrors.title" data-testid="event-title-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.title }}</p>
    </div>

    <div>
      <label for="location" class="block text-sm font-medium text-gray-700 mb-1">Location <span class="text-red-400">*</span></label>
      <textarea
        id="location"
        data-testid="event-location-input"
        v-model="form.location"
        rows="3"
        :class="['w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-indigo-500', fieldErrors.location ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']"
        placeholder="Where is this event?"
      />
      <p v-if="fieldErrors.location" data-testid="event-location-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.location }}</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="start" class="block text-sm font-medium text-gray-700 mb-1">Start <span class="text-red-400">*</span></label>
        <input
          id="start"
          data-testid="event-start-input"
          v-model="form.start"
          type="datetime-local"
          required
          step="900"
          :min="nowLocal"
          :class="['w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-indigo-500', fieldErrors.start ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']"
        />
        <p v-if="fieldErrors.start" data-testid="event-start-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.start }}</p>
      </div>
      <div>
        <label for="end" class="block text-sm font-medium text-gray-700 mb-1">End <span class="text-red-400">*</span></label>
        <input
          id="end"
          data-testid="event-end-input"
          v-model="form.end"
          type="datetime-local"
          required
          step="900"
          :min="minEnd"
          :class="['w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-indigo-500', fieldErrors.end ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']"
        />
        <p v-if="fieldErrors.end" data-testid="event-end-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.end }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="visibility" class="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
        <select
          id="visibility"
          data-testid="event-visibility-select"
          v-model="form.visibility"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        >
          <option value="Public">Public</option>
          <option value="Unlisted">Unlisted</option>
        </select>
      </div>
      <div>
        <label for="joinMode" class="block text-sm font-medium text-gray-700 mb-1">Who can join?</label>
        <select
          id="joinMode"
          data-testid="event-joinmode-select"
          v-model="form.joinMode"
          :disabled="form.visibility === 'Unlisted'"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option value="Open">Anyone</option>
          <option value="InviteOnly">Invite only</option>
        </select>
      </div>
    </div>

    <div>
      <label for="capacity" class="block text-sm font-medium text-gray-700 mb-1">
        Max attendees <span class="text-gray-400 font-normal">(optional)</span>
      </label>
      <input
        id="capacity"
        data-testid="event-capacity-input"
        v-model="form.capacity"
        type="number"
        min="1"
        :class="['w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:ring-indigo-500 sm:max-w-[12rem]', fieldErrors.capacity ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']"
        placeholder="No limit"
      />
      <p v-if="fieldErrors.capacity" data-testid="event-capacity-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.capacity }}</p>
    </div>

    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">
        Event image <span class="text-gray-400 font-normal">(optional)</span>
      </label>
      <div v-if="previewUrl" class="mb-3">
        <img :src="previewUrl" alt="Event image preview" class="rounded-lg max-h-48 object-cover" />
        <div class="flex gap-2 mt-2">
          <label class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition">
            Change
            <input type="file" accept="image/*" class="hidden" @change="onFileChange" />
          </label>
          <button type="button" @click="removeImage" class="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition">
            Remove
          </button>
        </div>
      </div>
      <div v-else>
        <label class="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg cursor-pointer hover:bg-gray-50 transition">
          Choose image
          <input type="file" accept="image/*" class="hidden" @change="onFileChange" />
        </label>
        <p class="mt-1.5 text-xs text-gray-400">PNG, JPG up to 10MB. Will be shown on the event card.</p>
      </div>
      <ImageCropper
        v-if="selectedFile"
        :image-file="selectedFile"
        shape="rectangle"
        :aspect-ratio="16/9"
        title="Crop Event Image"
        @crop="onCrop"
        @cancel="onCancelCrop"
      />
    </div>

    <div
      v-if="error"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <div class="flex items-center gap-3 pt-2">
      <button
        type="submit"
        data-testid="event-submit-btn"
        :disabled="!isValid || submitting"
        class="bg-indigo-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {{ submitting ? 'Creating...' : 'Create Event' }}
      </button>
      <RouterLink
        to="/dashboard"
        class="text-sm text-gray-500 hover:text-gray-700"
      >
        Cancel
      </RouterLink>
    </div>
  </form>
</template>
