<script setup>
import { ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import ImageCropper from '@/features/profile/components/ImageCropper.vue'
import EventForm from '@/features/events/components/EventForm.vue'

const router = useRouter()
const { authFetch } = useApi()

const form = ref({
  title: '',
  location: '',
  description: '',
  start: '',
  end: '',
  visibility: 0,
  joinMode: 0,
  capacity: null,
  cost: null
})

const submitting = shallowRef(false)
const error = shallowRef(null)
const submitted = shallowRef(false)
const eventFormRef = ref(null)

// Event image
const selectedFile = ref(null)
const croppedBlob = ref(null)
const previewUrl = ref(null)

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
  if (!eventFormRef.value?.isValid) return

  submitting.value = true
  error.value = null

  try {
    const f = form.value
    const body = {
      title: f.title.trim(),
      location: f.location.trim(),
      description: f.description || null,
      start: new Date(f.start).toISOString(),
      end: new Date(f.end).toISOString(),
      visibility: f.visibility,
      joinMode: f.joinMode,
      capacity: f.capacity || null,
      cost: f.cost || null
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
    <EventForm
      ref="eventFormRef"
      v-model="form"
      :submitted="submitted"
      test-id-prefix="event"
      :show-cost="true"
    />

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
        :disabled="!eventFormRef?.isValid || submitting"
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
