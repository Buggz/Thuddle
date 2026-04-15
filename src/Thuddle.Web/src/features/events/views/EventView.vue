<script setup>
import { shallowRef, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'
import DiscussionTab from '@/features/events/components/DiscussionTab.vue'

const route = useRoute()
const router = useRouter()
const { authFetch } = useApi()
const auth = useAuthStore()

const event = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)
const joining = shallowRef(false)

const activeTab = shallowRef('about')
const participants = ref([])
const participantsLoading = shallowRef(false)
const participantsLoaded = shallowRef(false)

async function loadEvent() {
  loading.value = true
  error.value = null
  try {
    const url = apiUrl(`/api/events/${route.params.id}`)
    let res
    if (auth.isAuthenticated) {
      res = await authFetch(`/api/events/${route.params.id}`)
    } else {
      res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
    }
    event.value = await res.json()
  } catch (err) {
    error.value = err.message || 'Failed to load event.'
  } finally {
    loading.value = false
  }
}

async function loadParticipants() {
  if (participantsLoaded.value) return
  participantsLoading.value = true
  try {
    let res
    if (auth.isAuthenticated) {
      res = await authFetch(`/api/events/${route.params.id}/participants`)
    } else {
      res = await fetch(apiUrl(`/api/events/${route.params.id}/participants`))
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
    }
    participants.value = await res.json()
    participantsLoaded.value = true
  } catch (err) {
    error.value = err.message || 'Failed to load participants.'
  } finally {
    participantsLoading.value = false
  }
}

function selectTab(tab) {
  activeTab.value = tab
  if (tab === 'discussion' && event.value) {
    event.value.hasUnreadDiscussion = false
  }
  if (tab === 'attendees' && !participantsLoaded.value) {
    loadParticipants()
  }
}

async function joinEvent() {
  joining.value = true
  error.value = null
  try {
    await authFetch(`/api/events/${route.params.id}/join`, { method: 'POST' })
    event.value.hasJoined = true
    event.value.canJoin = false
    event.value.participantCount++
    // Refresh attendee list if already loaded
    participantsLoaded.value = false
    if (activeTab.value === 'attendees') loadParticipants()
  } catch (err) {
    error.value = err.message || 'Failed to join event.'
  } finally {
    joining.value = false
  }
}

function profilePictureUrl(keycloakId) {
  return apiUrl(`/api/profile/picture/${keycloakId}`)
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(loadEvent)

// Re-fetch event data when auth state changes so admin/join status updates
watch(() => auth.isAuthenticated, (authenticated, wasAuthenticated) => {
  if (authenticated !== wasAuthenticated) {
    participantsLoaded.value = false
    loadEvent()
  }
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <button
      @click="router.back()"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back
    </button>

    <div v-if="loading" class="text-center py-16 text-gray-400">Loading event...</div>

    <div v-else-if="error && !event" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <template v-else-if="event">
      <div data-testid="event-detail" class="bg-white shadow rounded-xl overflow-hidden">
        <!-- Header -->
        <div class="px-6 pt-6 pb-4 border-b border-gray-100">
          <h1 data-testid="event-title" class="text-2xl font-bold text-gray-900">{{ event.title }}</h1>
          <p class="mt-1 text-sm text-gray-500">Hosted by {{ event.ownerName }}</p>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5">
          <!-- Location -->
          <div v-if="event.location">
            <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Location</h2>
            <p class="text-gray-700 whitespace-pre-line">{{ event.location }}</p>
          </div>

          <!-- Details grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Date & Time -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-indigo-50 p-2">
                <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-900">{{ formatDate(event.start) }}</p>
                <p class="text-sm text-gray-500">to {{ formatDate(event.end) }}</p>
              </div>
            </div>

            <!-- Cost -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-green-50 p-2">
                <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-900">
                  {{ event.cost ? event.cost.toFixed(2) : 'Free' }}
                </p>
                <p class="text-sm text-gray-500">{{ event.cost ? 'Per person' : 'No cost to attend' }}</p>
              </div>
            </div>

            <!-- Capacity / Participants -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-blue-50 p-2">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-900">{{ event.participantCount }} joined</p>
                <p class="text-sm text-gray-500">
                  {{ event.capacity ? `${event.capacity} spots total` : 'Unlimited spots' }}
                </p>
              </div>
            </div>

            <!-- Join Mode & Visibility -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-yellow-50 p-2">
                <svg class="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div>
                <p class="text-sm font-medium text-gray-900">
                  {{ event.joinMode === 0 ? 'Open to all' : 'Invite only' }}
                </p>
                <p class="text-sm text-gray-500">
                  {{ event.visibility === 0 ? 'Public event' : 'Unlisted event' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Join / Status -->
          <div class="flex items-center gap-3 pt-2">
            <RouterLink
              data-testid="event-manage-btn"
              v-if="event.isAdmin"
              :to="{ name: 'manage-event', params: { id: event.id } }"
              class="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gray-800 text-white hover:bg-gray-900 transition-colors"
            >
              Manage Event
            </RouterLink>
            <button
              v-if="!auth.isAuthenticated"
              data-testid="event-join-btn-disabled"
              disabled
              class="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed"
              title="Sign in to join this event"
            >
              Join this event
            </button>
            <button
              v-else-if="event.canJoin"
              data-testid="event-join-btn"
              :disabled="joining"
              @click="joinEvent"
              class="px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ joining ? 'Joining…' : 'Join this event' }}
            </button>
            <span
              v-else-if="event.hasJoined"
              data-testid="event-joined-badge"
              class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-green-700 bg-green-100 rounded-lg"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              You've joined
            </span>
            <span
              v-else-if="event.joinMode === 1"
              data-testid="event-invite-only-msg"
              class="text-sm text-gray-500"
            >
              This event is invite only
            </span>
            <div v-if="error" class="ml-auto text-sm text-red-600">{{ error }}</div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="border-t border-gray-100">
          <nav class="flex px-6" aria-label="Tabs">
            <button
              @click="selectTab('about')"
              class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              :class="activeTab === 'about'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              About this event
            </button>
            <button
              data-testid="event-tab-discussion"
              @click="selectTab('discussion')"
              class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              :class="activeTab === 'discussion'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              Discussion
              <span v-if="event.hasUnreadDiscussion && activeTab !== 'discussion'" class="relative flex h-2.5 w-2.5 ml-1.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
              </span>
              <span v-if="event.postCount" class="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {{ event.postCount }}
              </span>
              <span v-if="event.pendingPostCount" class="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                ({{ event.pendingPostCount }})
              </span>
            </button>
            <button
              @click="selectTab('attendees')"
              class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              :class="activeTab === 'attendees'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              Attendees
              <span class="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {{ event.participantCount }}
              </span>
            </button>
          </nav>
        </div>

        <!-- Tab: About -->
        <div v-if="activeTab === 'about'" class="px-6 py-5">
          <div v-if="event.description" class="prose prose-sm max-w-none text-gray-700" v-html="event.description" />
          <p v-else class="text-sm text-gray-400">No description provided.</p>
        </div>

        <!-- Tab: Discussion -->
        <div v-if="activeTab === 'discussion'" class="px-6 py-5">
          <DiscussionTab :event-id="event.id" :is-admin="event.isAdmin" />
        </div>

        <!-- Tab: Attendees -->
        <div v-if="activeTab === 'attendees'" class="px-6 py-5">
          <div v-if="participantsLoading" class="text-center py-8 text-gray-400 text-sm">Loading attendees...</div>
          <div v-else-if="participants.length === 0" class="text-center py-8">
            <p class="text-gray-400 text-sm">No attendees yet.</p>
          </div>
          <ul v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <li
              v-for="p in participants"
              :key="p.keycloakId"
              class="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5"
            >
              <img
                v-if="p.hasProfilePicture"
                :src="profilePictureUrl(p.keycloakId)"
                :alt="p.displayName"
                class="w-9 h-9 rounded-full object-cover bg-gray-100"
              />
              <span
                v-else
                class="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold"
              >
                {{ p.displayName.charAt(0).toUpperCase() }}
              </span>
              <span class="text-sm font-medium text-gray-700 truncate">{{ p.displayName }}</span>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
