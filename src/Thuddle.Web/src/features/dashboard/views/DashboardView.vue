<script setup>
import { shallowRef, ref, onMounted, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { apiUrl } from '@/api'

const { authFetch } = useApi()
const auth = useAuthStore()
const perms = usePermissionsStore()

const events = ref([])
const loading = shallowRef(true)
const error = shallowRef(null)
const page = shallowRef(1)
const totalPages = shallowRef(1)
const hintDismissed = shallowRef(localStorage.getItem('thuddle:profile-hint-dismissed') === 'true')

const showProfileHint = computed(() =>
  auth.isAuthenticated
  && perms.loaded
  && !hintDismissed.value
  && (!perms.hasDisplayName || !perms.hasProfilePicture)
)

const profileHintMessage = computed(() => {
  if (!perms.hasDisplayName && !perms.hasProfilePicture) return 'Set your display name and upload a profile picture'
  if (!perms.hasDisplayName) return 'Set your display name'
  return 'Upload a profile picture'
})

function dismissProfileHint() {
  hintDismissed.value = true
  localStorage.setItem('thuddle:profile-hint-dismissed', 'true')
}

const hasPrev = computed(() => page.value > 1)
const hasNext = computed(() => page.value < totalPages.value)

async function loadEvents() {
  loading.value = true
  error.value = null
  try {
    const url = apiUrl(`/api/events?page=${page.value}&pageSize=12`)
    let res
    if (auth.isAuthenticated) {
      res = await authFetch(`/api/events?page=${page.value}&pageSize=12`)
    } else {
      res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
    }
    const data = await res.json()
    events.value = data.items
    totalPages.value = data.totalPages
  } catch (err) {
    error.value = err.message || 'Failed to load events.'
  } finally {
    loading.value = false
  }
}

function prevPage() {
  if (hasPrev.value) {
    page.value--
    loadEvents()
  }
}

function nextPage() {
  if (hasNext.value) {
    page.value++
    loadEvents()
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  if (!auth.isAuthenticated || perms.loaded) {
    loadEvents()
  }
})

watch(() => perms.loaded, (loaded) => {
  if (loaded) {
    page.value = 1
    loadEvents()
  }
})
</script>

<template>
  <div>
    <!-- Profile setup hint -->
    <div
      v-if="showProfileHint"
      class="mb-6 flex items-center justify-between gap-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3"
    >
      <p class="text-sm text-indigo-800">
        {{ profileHintMessage }} to help others recognise you.
        <RouterLink :to="{ name: 'profile' }" class="font-semibold underline hover:text-indigo-600">Go to profile</RouterLink>
      </p>
      <button
        @click="dismissProfileHint"
        class="shrink-0 text-xs font-medium text-indigo-500 hover:text-indigo-700"
      >
        Don't remind me again
      </button>
    </div>

    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900">Events</h2>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-400">Loading events...</div>

      <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {{ error }}
      </div>

      <div v-else-if="events.length === 0" class="text-center py-12">
        <p class="text-gray-500 text-lg">No events yet.</p>
        <p class="text-gray-400 text-sm mt-1">Create one to get started!</p>
      </div>

      <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <RouterLink
          v-for="event in events"
          :key="event.id"
          :to="{ name: 'event', params: { id: event.id } }"
          class="bg-white shadow rounded-lg p-5 flex flex-col hover:shadow-md transition-shadow relative"
          :class="{ 'ring-2 ring-amber-400': event.hasInvitation && !event.hasJoined }"
        >
          <div v-if="event.hasInvitation && !event.hasJoined" class="flex items-center gap-1 text-amber-600 text-xs font-semibold mb-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            You're invited!
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-1">{{ event.title }}</h3>
          <p v-if="event.location" class="text-sm text-gray-500 mb-3 line-clamp-2">{{ event.location }}</p>
          <div class="mt-auto space-y-1 text-xs text-gray-400">
            <div class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <span>{{ formatDate(event.start) }} – {{ formatDate(event.end) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="event.visibility === 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
              >
                {{ event.visibility === 0 ? 'Public' : 'Unlisted' }}
              </span>
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="event.joinMode === 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'"
              >
                {{ event.joinMode === 0 ? 'Open' : 'Invite only' }}
              </span>
              <span class="text-gray-400">
                <template v-if="event.capacity">{{ event.participantCount }}/{{ event.capacity }}</template>
                <template v-else>{{ event.participantCount }} attending</template>
              </span>
              <span class="font-medium" :class="event.cost ? 'text-gray-700' : 'text-green-600'">
                {{ event.cost ? event.cost.toFixed(2) : 'Free' }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mt-8">
        <button
          :disabled="!hasPrev"
          @click="prevPage"
          class="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span class="text-sm text-gray-500">Page {{ page }} of {{ totalPages }}</span>
        <button
          :disabled="!hasNext"
          @click="nextPage"
          class="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </template>
  </div>
</template>
