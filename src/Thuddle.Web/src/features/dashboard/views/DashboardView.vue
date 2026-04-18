<script setup>
import { shallowRef, onMounted, onBeforeUnmount, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { useEventsStore } from '@/features/events/stores/events'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'

const auth = useAuthStore()
const perms = usePermissionsStore()
const eventsStore = useEventsStore()

const {
  items: events,
  page,
  totalPages,
  loadingDashboard: loading,
  dashboardError: error
} = storeToRefs(eventsStore)

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
  await eventsStore.loadDashboard({ page: page.value })
}

function prevPage() {
  if (hasPrev.value) {
    eventsStore.loadDashboard({ page: page.value - 1 })
  }
}

function nextPage() {
  if (hasNext.value) {
    eventsStore.loadDashboard({ page: page.value + 1 })
  }
}

function formatCost(cost) {
  if (cost === 0 || cost === null || cost === undefined) return 'Free'
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(cost)
}

function formatDateRange(startIso, endIso) {
  try {
    if (!startIso) return ''
    const start = new Date(startIso)
    const startDate = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

    if (!endIso || isSameDay(startIso, endIso)) {
      const startTime = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      return `${startDate} • ${startTime}`
    }

    const end = new Date(endIso)
    const endDate = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    return `${startDate} - ${endDate}`
  } catch {
    return ''
  }
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
  loadEvents()
})

onBeforeUnmount(() => {
  eventsStore.releaseDashboard()
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

    <div v-if="loading" class="py-12">
      <FunnyLoader title="Loading events" />
    </div>

    <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-else-if="events.length === 0" class="text-center py-12">
      <p class="text-gray-500 text-lg">No events yet.</p>
      <p class="text-gray-400 text-sm mt-1">Create one to get started!</p>
    </div>

    <template v-else>
      <div data-testid="event-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <RouterLink
          data-testid="event-card"
          v-for="(event, idx) in events"
          :key="event.id"
          :to="{ name: 'event', params: { id: event.id } }"
          class="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60 hover:shadow-lg hover:ring-gray-300 transition-all duration-200"
          :class="{
            'ring-2 ring-amber-400 shadow-amber-100': event.hasInvitation && !event.hasJoined,
          }"
        >
          <!-- Event Image -->
          <div class="relative w-full h-40 shrink-0">
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

            <!-- Date/Time Overlay -->
            <div class="absolute bottom-3 left-3 flex px-2.5 py-1.5 bg-white/95 backdrop-blur shadow-sm rounded-lg items-center gap-2">
              <div class="text-sm font-extrabold text-indigo-700 leading-none">
                {{ formatDateRange(event.start, event.end) }}
              </div>
            </div>

            <!-- Absolute Badges (Invited / Attending) -->
            <div
              v-if="event.hasInvitation && !event.hasJoined"
              class="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-md uppercase tracking-wide"
            >
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Invited
            </div>
            
            <div
              v-if="event.hasJoined"
              class="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-md uppercase tracking-wide"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Attending
            </div>
          </div>

          <!-- Card content -->
          <div class="flex flex-col flex-1 p-5 min-w-0">
            <!-- Title & Location -->
            <h3 class="text-xl font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
              {{ event.title }}
            </h3>
            
            <div class="flex-1 mt-1.5 mb-5">
              <div class="flex items-center gap-1.5 text-sm text-gray-500">
                <svg class="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                <span v-if="event.location" class="truncate">{{ event.location }}</span>
                <span v-else class="italic">TBD</span>
              </div>
            </div>

            <!-- Bottom Row: Badges -->
            <div class="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 mt-auto border-t border-gray-100 pt-4">
              <div class="flex flex-wrap gap-2">
                <!-- Cost Pill -->
                <span class="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 border border-gray-200/60">
                  <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                  </svg>
                  {{ formatCost(event.cost) }}
                </span>

                <!-- Join Mode -->
                <span class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border"
                      :class="event.joinMode === 0 ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-rose-50 text-rose-700 border-rose-100'">
                  <svg v-if="event.joinMode !== 0" class="w-3.5 h-3.5 opacity-80" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  {{ event.joinMode === 0 ? 'Public' : 'Invite Only' }}
                </span>
                
                <!-- Attendees Pill -->
                <span class="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200/60">
                  <svg class="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                  <template v-if="event.capacity">{{ event.participantCount }}/{{ event.capacity }}</template>
                  <template v-else>{{ event.participantCount }}</template>
                </span>
              </div>

              <!-- Comments Info -->
              <div class="flex items-center gap-1.5 text-xs font-medium">
                <span v-if="event.pendingPostCount" class="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5 text-[10px] uppercase font-bold tracking-wider">
                  {{ event.pendingPostCount }} pending
                </span>
                
                <div v-if="event.postCount" class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors"
                     :class="event.hasUnreadDiscussion ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-200/60'">
                  <div class="relative">
                    <svg class="w-3.5 h-3.5" :class="event.hasUnreadDiscussion ? 'text-indigo-600' : 'opacity-70'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                    </svg>
                    <!-- Notification dot specifically on the icon -->
                    <span v-if="event.hasUnreadDiscussion" data-testid="event-unread-indicator" class="absolute -top-1 -right-1.5 flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-indigo-50"></span>
                    </span>
                  </div>
                  <span :class="{'font-bold': event.hasUnreadDiscussion}">{{ event.postCount }}</span>
                </div>
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
