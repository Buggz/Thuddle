<script setup>
import { reactive, shallowRef, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'

const router = useRouter()
const { authFetch } = useApi()

const form = reactive({
  title: '',
  description: '',
  start: '',
  end: '',
  visibility: 'Public',
  joinMode: 'Open',
  capacity: ''
})

const submitting = shallowRef(false)
const error = shallowRef(null)

const isValid = computed(() =>
  form.title.trim().length > 0 &&
  form.start &&
  form.end &&
  new Date(form.end) > new Date(form.start) &&
  (form.capacity === '' || (Number.isInteger(Number(form.capacity)) && Number(form.capacity) >= 1))
)

async function submit() {
  if (!isValid.value) return

  submitting.value = true
  error.value = null

  try {
    const body = {
      title: form.title.trim(),
      description: form.description.trim(),
      start: new Date(form.start).toISOString(),
      end: new Date(form.end).toISOString(),
      visibility: form.visibility === 'Public' ? 0 : 1,
      joinMode: form.joinMode === 'Open' ? 0 : 1,
      capacity: form.capacity ? Number(form.capacity) : null
    }

    await authFetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

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
      <label for="title" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
      <input
        id="title"
        v-model="form.title"
        type="text"
        required
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        placeholder="Event title"
      />
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
      <textarea
        id="description"
        v-model="form.description"
        rows="3"
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        placeholder="What's this event about?"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="start" class="block text-sm font-medium text-gray-700 mb-1">Start</label>
        <input
          id="start"
          v-model="form.start"
          type="datetime-local"
          required
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label for="end" class="block text-sm font-medium text-gray-700 mb-1">End</label>
        <input
          id="end"
          v-model="form.end"
          type="datetime-local"
          required
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="visibility" class="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
        <select
          id="visibility"
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
          v-model="form.joinMode"
          class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
        v-model="form.capacity"
        type="number"
        min="1"
        class="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:max-w-[12rem]"
        placeholder="No limit"
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
