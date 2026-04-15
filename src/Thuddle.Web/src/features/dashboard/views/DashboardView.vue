<script setup>
import { shallowRef, ref, onMounted, computed, watch, onUnmounted } from 'vue'
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

// Loading messages that rotate while waiting for the API
const loadingMessage = shallowRef('Loading events...')
let loadingTimers = []

const funnyMessages = [
  'Constructing additional pylons',
  'Feeding the pigeons',
  'Adding hamsters to wheel',
  'Reticulating splines',
  'Convincing electrons to cooperate',
  'Bribing the server hamsters',
  'Untangling the internet cables',
  'Polishing the pixels',
  'Teaching the database to read',
  'Warming up the flux capacitor',
  'Calibrating the cloud',
  'Herding cats',
  'Consulting the magic 8-ball',
  'Downloading more RAM',
  'Inflating the cloud',
  'Charging the laser sharks',
  'Tuning the hyperdrives',
  'Rolling for initiative',
  'Summoning the data elves',
  'Shaking the binary tree',
]

function startLoadingMessages() {
  loadingTimers.push(setTimeout(() => {
    loadingMessage.value = 'Warming up API...'
    let lastIndex = -1
    loadingTimers.push(setInterval(() => {
      let idx
      do { idx = Math.floor(Math.random() * funnyMessages.length) } while (idx === lastIndex)
      lastIndex = idx
      loadingMessage.value = funnyMessages[idx] + '...'
    }, 3000))
  }, 2000))
}

function stopLoadingMessages() {
  loadingTimers.forEach(id => { clearTimeout(id); clearInterval(id) })
  loadingTimers = []
}

onUnmounted(stopLoadingMessages)

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
  loadingMessage.value = 'Loading events...'
  error.value = null
  startLoadingMessages()
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
    stopLoadingMessages()
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

function formatDateShort(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function isSameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate()
}

function eventImageGradient(index) {
  const gradients = [
    'from-indigo-400 to-purple-500',
    'from-emerald-400 to-teal-500',
    'from-orange-400 to-rose-500',
    'from-sky-400 to-blue-500',
    'from-fuchsia-400 to-pink-500',
    'from-amber-400 to-orange-500',
  ]
  return gradients[index % gradients.length]
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

    <div class="flex items-center justify-between mb-8">
      <h2 data-testid="events-heading" class="text-3xl font-extrabold text-gray-900 tracking-tight">Events</h2>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-400 text-lg">{{ loadingMessage }}</div>

    <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-else-if="events.length === 0" class="text-center py-12">
      <p class="text-gray-500 text-lg">No events yet.</p>
      <p class="text-gray-400 text-sm mt-1">Create one to get started!</p>
    </div>

    <template v-else>
      <div data-testid="event-list" class="flex flex-col gap-4">
        <RouterLink
          data-testid="event-card"
          v-for="(event, idx) in events"
          :key="event.id"
          :to="{ name: 'event', params: { id: event.id } }"
          class="group relative flex overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60 hover:shadow-lg hover:ring-gray-300 transition-all duration-200"
          :class="{
            'ring-2 ring-amber-400 shadow-amber-100': event.hasInvitation && !event.hasJoined,
          }"
        >
          <!-- Event Image / Gradient placeholder -->
          <div class="relative w-44 shrink-0 hidden sm:block">
            <img
              v-if="event.picturePath"
              :src="event.picturePath"
              :alt="event.title"
              class="absolute inset-0 w-full h-full object-cover"
            />
            <div
              v-else
              class="absolute inset-0 bg-linear-to-br opacity-90"
              :class="eventImageGradient(idx)"
            >
              <div class="absolute inset-0 flex items-center justify-center">
                <svg class="w-10 h-10 text-white/40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              </div>
            </div>
            <!-- Invitation ribbon -->
            <div
              v-if="event.hasInvitation && !event.hasJoined"
              class="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-md uppercase tracking-wide"
            >
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Invited
            </div>
          </div>

          <!-- Card content -->
          <div class="flex flex-1 items-center gap-6 px-5 py-4 min-w-0">
            <!-- Dates -->
            <div class="hidden md:flex flex-col items-start shrink-0 min-w-40">
              <template v-if="isSameDay(event.start, event.end)">
                <span class="text-base font-bold text-gray-900 leading-snug">{{ formatDateShort(event.start) }}</span>
              </template>
              <template v-else>
                <span class="text-base font-bold text-gray-900 leading-snug">{{ formatDateShort(event.start) }}</span>
                <span class="text-xs text-gray-400 font-medium my-0.5">to</span>
                <span class="text-base font-bold text-gray-900 leading-snug">{{ formatDateShort(event.end) }}</span>
              </template>
            </div>

            <!-- Title + Location -->
            <div class="flex-1 min-w-0">
              <!-- Mobile-only invitation badge -->
              <div v-if="event.hasInvitation && !event.hasJoined" class="sm:hidden flex items-center gap-1 text-amber-600 text-xs font-bold mb-1.5 uppercase tracking-wide">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                You're invited!
              </div>
              <h3 class="text-lg font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                {{ event.title }}
              </h3>
              <p v-if="event.location" class="text-sm text-gray-500 truncate mt-0.5">
                {{ event.location }}
              </p>
            </div>

            <!-- Badges + Attendees -->
            <div class="hidden lg:flex flex-col items-end gap-2 shrink-0 min-w-32">
              <div class="flex items-center gap-1.5">
                <span
                  class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                  :class="event.joinMode === 0
                    ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                    : 'bg-gray-50 text-gray-600 ring-1 ring-gray-200'"
                >
                  {{ event.joinMode === 0 ? 'Anyone can join' : 'Invite only' }}
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-sm text-gray-500">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                </svg>
                <span class="font-medium">
                  <template v-if="event.capacity">{{ event.participantCount }}/{{ event.capacity }}</template>
                  <template v-else>{{ event.participantCount }}</template>
                </span>
              </div>
              <div v-if="event.postCount || event.pendingPostCount" class="flex items-center gap-1.5 text-sm text-gray-500">
                <span v-if="event.pendingPostCount" class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {{ event.pendingPostCount }} pending
                </span>
                <span>💬</span>
                <span class="font-medium">{{ event.postCount }}</span>
                <span v-if="event.hasUnreadDiscussion" data-testid="event-unread-indicator" class="relative flex h-2.5 w-2.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                </span>
              </div>
            </div>

            <!-- Attending status -->
            <!-- Attending status (fixed width to keep alignment) -->
            <div class="shrink-0 pl-2 hidden sm:block w-36">
              <div
                v-if="event.hasJoined"
                class="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 ring-1 ring-emerald-200"
              >
                <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span class="text-sm font-bold text-emerald-700">Attending</span>
              </div>
              <div
                v-else-if="event.hasInvitation"
                class="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 ring-1 ring-amber-200"
              >
                <svg class="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span class="text-sm font-bold text-amber-700">Invited</span>
              </div>
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
