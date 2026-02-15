<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const displayName = ref('')
const savedName = ref('')
const saving = ref(false)
const uploading = ref(false)
const message = ref(null)
const error = ref(null)
const hasProfilePicture = ref(false)
const pictureUrl = ref(null)
const pictureKey = ref(0)

function authHeaders() {
  return { Authorization: `Bearer ${auth.getToken()}` }
}

async function loadProfile() {
  try {
    const res = await fetch('/api/profile', { headers: authHeaders() })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    displayName.value = data.displayName || ''
    savedName.value = data.displayName || ''
    hasProfilePicture.value = data.hasProfilePicture
    if (data.hasProfilePicture) {
      pictureUrl.value = `/api/profile/picture/${auth.keycloakId}`
    }
  } catch (err) {
    error.value = 'Failed to load profile.'
  }
}

async function saveDisplayName() {
  saving.value = true
  message.value = null
  error.value = null
  try {
    const res = await fetch('/api/profile/displayname', {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: displayName.value })
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    savedName.value = data.displayName
    message.value = 'Display name saved.'
  } catch (err) {
    error.value = 'Failed to save display name.'
  } finally {
    saving.value = false
  }
}

async function uploadPicture(event) {
  const file = event.target.files?.[0]
  if (!file) return

  uploading.value = true
  message.value = null
  error.value = null

  const formData = new FormData()
  formData.append('picture', file)

  try {
    const res = await fetch('/api/profile/picture', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    hasProfilePicture.value = true
    pictureKey.value++
    pictureUrl.value = `/api/profile/picture/${auth.keycloakId}`
    message.value = 'Profile picture uploaded.'
  } catch (err) {
    error.value = err.message || 'Failed to upload picture.'
  } finally {
    uploading.value = false
    event.target.value = ''
  }
}

onMounted(loadProfile)
</script>

<template>
  <div class="max-w-lg mx-auto">
    <h2 class="text-2xl font-bold text-gray-900 mb-8">Settings</h2>

    <div
      v-if="message"
      class="mb-6 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700"
    >
      {{ message }}
    </div>
    <div
      v-if="error"
      class="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <!-- Profile Picture -->
    <div class="bg-white shadow rounded-lg p-6 mb-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Profile Picture</h3>
      <div class="flex items-center gap-6">
        <div
          class="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0"
        >
          <img
            v-if="hasProfilePicture && pictureUrl"
            :src="pictureUrl"
            :key="pictureKey"
            alt="Profile"
            class="w-full h-full object-cover"
          />
          <svg
            v-else
            class="w-10 h-10 text-gray-400"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
            />
          </svg>
        </div>
        <div>
          <label
            class="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-indigo-700 transition"
            :class="{ 'opacity-50 pointer-events-none': uploading }"
          >
            {{ uploading ? 'Uploading...' : 'Upload Picture' }}
            <input
              type="file"
              accept="image/*"
              class="hidden"
              @change="uploadPicture"
              :disabled="uploading"
            />
          </label>
          <p class="mt-2 text-xs text-gray-500">PNG, JPG up to 5MB. Will be cropped to square.</p>
        </div>
      </div>
    </div>

    <!-- Display Name -->
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-4">Display Name</h3>
      <div class="flex gap-3">
        <input
          v-model="displayName"
          type="text"
          maxlength="50"
          placeholder="Enter a display name"
          class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button
          @click="saveDisplayName"
          :disabled="saving || displayName === savedName"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>
  </div>
</template>
