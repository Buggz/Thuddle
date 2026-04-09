<script setup>
import { shallowRef, ref, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'

const route = useRoute()
const router = useRouter()
const { authFetch } = useApi()

const event = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)
const joining = shallowRef(false)

async function loadEvent() {
  loading.value = true
  error.value = null
  try {
    const res = await authFetch(`/api/events/${route.params.id}`)
    event.value = await res.json()
  } catch (err) {
    error.value = err.message || 'Failed to load event.'
  } finally {
    loading.value = false
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
  } catch (err) {
    error.value = err.message || 'Failed to join event.'
  } finally {
    joining.value = false
  }
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
      <div class="bg-white shadow rounded-xl overflow-hidden">
        <!-- Header -->
        <div class="px-6 pt-6 pb-4 border-b border-gray-100">
          <h1 class="text-2xl font-bold text-gray-900">{{ event.title }}</h1>
          <p class="mt-1 text-sm text-gray-500">Hosted by {{ event.ownerName }}</p>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-5">
          <!-- Description -->
          <div v-if="event.description">
            <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">About</h2>
            <p class="text-gray-700 whitespace-pre-line">{{ event.description }}</p>
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
                  {{ event.cost ? `$${event.cost.toFixed(2)}` : 'Free' }}
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
        </div>

        <!-- Footer / Action -->
        <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
          <RouterLink
            v-if="event.isAdmin"
            :to="{ name: 'manage-event', params: { id: event.id } }"
            class="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gray-800 text-white hover:bg-gray-900 transition-colors"
          >
            Manage Event
          </RouterLink>
          <button
            v-if="event.canJoin"
            :disabled="joining"
            @click="joinEvent"
            class="px-5 py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ joining ? 'Joining…' : 'Join this event' }}
          </button>
          <span
            v-else-if="event.hasJoined"
            class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-green-700 bg-green-100 rounded-lg"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            You've joined
          </span>
          <span
            v-else-if="event.joinMode === 1"
            class="text-sm text-gray-500"
          >
            This event is invite only
          </span>

          <div v-if="error" class="ml-auto text-sm text-red-600">{{ error }}</div>
        </div>
      </div>
    </template>
  </div>
</template>
