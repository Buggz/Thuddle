<script setup>
import { shallowRef, ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useEventsStore } from '@/features/events/stores/events'
import { useFeatureFlags } from '@/shared/featureFlags'
import { apiUrl } from '@/api'
import { auctionApi } from '@/api'
import DiscussionTab from '@/features/events/components/DiscussionTab.vue'
import RafflesSection from '@/features/events/raffles/RafflesSection.vue'
import ActivitiesSection from '@/features/events/activities/ActivitiesSection.vue'
import { raffleApi } from '@/api'
import { formatCurrency } from '@/shared/formatCurrency'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import EventTabBar from '@/features/events/components/EventTabBar.vue'
import AddToCalendarButton from '@/features/events/components/AddToCalendarButton.vue'
import { useEventFeaturesStore } from '@/features/events/stores/eventFeatures'
import { EVENT_FEATURES, FeatureKeys } from '@/features/events/featureCatalog'

const route = useRoute()
const router = useRouter()
const { authFetch } = useApi()
const auth = useAuthStore()
const eventsStore = useEventsStore()
const permissions = usePermissionsStore()
const { auctions: auctionsEnabled } = useFeatureFlags()
const eventFeaturesStore = useEventFeaturesStore()

const loading = shallowRef(true)
const error = shallowRef(null)
const joining = shallowRef(false)
const leaveDialogOpen = ref(false)
const leaveTicketWarning = ref(null)

const isOwner = computed(() => !!(event.value && permissions.userId && event.value.ownerId === permissions.userId))
const leaveMessage = computed(() =>
  event.value?.joinMode === 1
    ? 'Your invitation will be kept, so you can rejoin later.'
    : 'You can rejoin anytime while spaces remain.'
)

// Whether the current user can see participant-only tabs (raffles, etc.).
// Owners/co-hosts get access regardless of explicit RSVP.
const hasParticipantAccess = computed(() =>
  !!(event.value && (event.value.hasJoined || event.value.isAdmin))
)

async function openLeaveDialog() {
  leaveTicketWarning.value = null
  leaveDialogOpen.value = true
  if (!auth.isAuthenticated) return
  try {
    const raffles = await raffleApi.list(authFetch, route.params.id)
    const total = (raffles || []).reduce((sum, r) => sum + (r.myTickets || 0), 0)
    if (total > 0) {
      const raffleCount = raffles.filter(r => (r.myTickets || 0) > 0).length
      leaveTicketWarning.value = `You hold ${total} raffle ticket${total === 1 ? '' : 's'} across ${raffleCount} raffle${raffleCount === 1 ? '' : 's'}. Your tickets will be kept and remain eligible for the draw.`
    }
  } catch {
    // Best-effort — never block the leave flow.
  }
}

const activeTab = shallowRef('about')
const participants = ref([])
const participantsLoading = shallowRef(false)
const participantsLoaded = shallowRef(false)

const auctionSettings = ref(null)
const visibleTabs = computed(() => {
  const tabs = [
    { key: 'about', label: 'About this event' },
    { key: 'discussion', label: 'Discussion', testid: 'event-tab-discussion' },
    { key: 'attendees', label: 'Attendees', testid: 'event-tab-attendees' }
  ]
  for (const meta of EVENT_FEATURES) {
    if (!eventFeaturesStore.isEnabled(route.params.id, meta.key)) continue
    if (meta.key === FeatureKeys.Auction && !auctionsEnabled.value) continue
    if ((meta.key === FeatureKeys.Raffles || meta.key === FeatureKeys.Activities) &&
        !(auth.isAuthenticated && hasParticipantAccess.value)) continue
    tabs.push({ key: meta.key, label: meta.label, icon: meta.icon, testid: `event-tab-${meta.key}` })
  }
  return tabs
})
const auctionStatus = computed(() => auctionSettings.value?.status || null)
const auctionStatusBadgeClass = computed(() => {
  switch (auctionStatus.value) {
    case 'Live': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Scheduled': return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'Ended': return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'Draft':
    default: return 'bg-amber-50 text-amber-700 border-amber-200'
  }
})

const event = computed(() => eventsStore.byId[route.params.id] ?? null)

async function loadEvent() {
  loading.value = true
  error.value = null
  try {
    const data = await eventsStore.loadEvent(route.params.id)
    if (!data) error.value = eventsStore.eventError
  } catch (err) {
    error.value = err.message || 'Failed to load event.'
  } finally {
    loading.value = false
  }
}

async function loadAuctionSettings() {
  if (!auctionsEnabled.value) {
    auctionSettings.value = { configured: false }
    return
  }
  try {
    // Use authFetch when authenticated, fall back to plain fetch for guests so
    // unauthenticated visitors still see public auction info.
    if (auth.isAuthenticated) {
      auctionSettings.value = await auctionApi.getSettings(authFetch, route.params.id)
    } else {
      const res = await fetch(apiUrl(`/api/events/${route.params.id}/auction`))
      auctionSettings.value = res.ok ? await res.json() : { configured: false }
    }
  } catch {
    // Never crash the page if the endpoint is unavailable — just hide auction UI.
    auctionSettings.value = { configured: false }
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
  if (tab === 'discussion') {
    eventsStore.markDiscussionRead(route.params.id)
  }
  if (tab === 'attendees' && !participantsLoaded.value) {
    loadParticipants()
  }
}

function goToAuction() {
  router.push({ name: 'auction', params: { id: route.params.id } })
}

async function confirmLeave() {
  try {
    await eventsStore.leaveEvent(route.params.id)
  } catch (err) {
    error.value = err.message || 'Failed to leave event.'
  } finally {
    leaveDialogOpen.value = false
  }
}

async function joinEvent() {
  joining.value = true
  error.value = null
  try {
    await eventsStore.joinEvent(route.params.id)
    // Refresh attendee list if already loaded / currently viewing
    participantsLoaded.value = false
    if (activeTab.value === 'attendees') loadParticipants()
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

function eventImageGradient(id) {
  if (!id) return 'from-indigo-400 to-purple-500'
  const gradients = [
    'from-indigo-400 to-purple-500',
    'from-emerald-400 to-teal-500',
    'from-orange-400 to-rose-500',
    'from-sky-400 to-blue-500',
    'from-fuchsia-400 to-pink-500',
    'from-amber-400 to-orange-500',
  ]
  const sum = id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  return gradients[sum % gradients.length]
}

// Auto-switch to raffles tab when navigated via ?raffle= deep link
// Only if the raffles feature is enabled for this event.
watch(() => route.query.raffle, (raffleId) => {
  if (raffleId && eventFeaturesStore.isEnabled(route.params.id, FeatureKeys.Raffles)) {
    activeTab.value = 'raffles'
  }
}, { immediate: true })

// Defensive: if the user loses participant access (e.g. they leave the event)
// while a participant-only tab is active, fall back to About.
watch(hasParticipantAccess, (hasAccess) => {
  if (!hasAccess && (activeTab.value === 'raffles' || activeTab.value === 'activities')) {
    activeTab.value = 'about'
  }
})

// If the active tab is a feature tab (raffles/auction/activities) and that feature
// gets disabled live (EventFeatureDisabled arrives), fall back to About.
watch(visibleTabs, (tabs) => {
  const keys = tabs.map((t) => t.key)
  if (!keys.includes(activeTab.value)) {
    activeTab.value = 'about'
  }
})

onMounted(() => {
  loadEvent()
  loadAuctionSettings()
  eventFeaturesStore.fetchFeatures(route.params.id).catch(() => { /* best-effort */ })
})

onBeforeUnmount(() => {
  eventsStore.releaseEvent(route.params.id)
})

// Re-fetch event data when auth state changes so admin/join status updates
watch(() => auth.isAuthenticated, (authenticated, wasAuthenticated) => {
  if (authenticated !== wasAuthenticated) {
    participantsLoaded.value = false
    loadEvent()
    loadAuctionSettings()
    eventFeaturesStore.fetchFeatures(route.params.id).catch(() => { /* best-effort */ })
  }
})

// When realtime signals the attendee count changed and we're on the attendees
// tab, refresh the list so names stay in sync.
watch(() => event.value?.participantCount, (newCount, oldCount) => {
  if (newCount !== oldCount && activeTab.value === 'attendees') {
    participantsLoaded.value = false
    loadParticipants()
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

    <div v-if="loading" class="py-12">
      <FunnyLoader title="Loading event" />
    </div>

    <div v-else-if="error && !event" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <template v-else-if="event">
      <div data-testid="event-detail" class="bg-white shadow rounded-xl overflow-hidden">
        <!-- Hero Header -->
        <div class="relative w-full h-56 sm:h-72">
          <img
            v-if="event.picturePath"
            :src="event.picturePath"
            :alt="event.title"
            data-testid="event-hero-image"
            class="absolute inset-0 w-full h-full object-cover"
          />
          <div
            v-else
            class="absolute inset-0 bg-linear-to-br opacity-90"
            :class="eventImageGradient(event.id)"
          >
            <div class="absolute inset-0 flex items-center justify-center">
              <svg class="w-16 h-16 text-white/30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
          </div>
          <div class="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/30 to-transparent"></div>
          
          <div class="absolute bottom-0 w-full px-6 pb-6">
            <div class="flex items-center gap-2 mb-3">
              <span class="inline-flex items-center gap-1.5 rounded-md bg-white/20 backdrop-blur-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white border border-white/30"
                    :class="event.joinMode === 0 ? 'bg-sky-500/30 border-sky-400/50' : 'bg-rose-500/30 border-rose-400/50'">
                <svg v-if="event.joinMode !== 0" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                {{ event.joinMode === 0 ? 'Public' : 'Invite Only' }}
              </span>
              <span v-if="event.visibility === 1" class="inline-flex items-center gap-1.5 rounded-md bg-white/20 backdrop-blur-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-white border border-white/30">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
                Unlisted
              </span>
            </div>
            <h1 data-testid="event-title" class="text-3xl sm:text-4xl font-extrabold text-white">{{ event.title }}</h1>
            <p class="mt-2 text-sm font-medium text-white/80">Hosted by <span class="text-white">{{ event.ownerName }}</span></p>
          </div>
          
          <div class="absolute top-4 right-4 flex flex-col items-end gap-2">
            <div v-if="event.hasJoined" data-testid="event-joined-badge" class="flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg uppercase tracking-wide">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Attending
            </div>
            <div
              v-if="event.hasJoined && event.cost > 0"
              data-testid="event-payment-badge"
              class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold shadow-lg uppercase tracking-wide"
              :class="event.hasPaid
                ? 'bg-emerald-500 text-white'
                : 'bg-amber-500 text-white'"
            >
              <svg v-if="event.hasPaid" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span v-if="event.hasPaid">Paid</span>
              <span v-else>Payment not yet registered</span>
            </div>
          </div>
        </div>

        <!-- Details grid (Re-styled) -->
        <div class="px-6 py-6 border-b border-gray-100 bg-gray-50/50">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            <!-- Date & Time -->
            <div class="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-indigo-50 p-2.5 text-indigo-600 ring-1 ring-indigo-100">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-bold text-gray-500 uppercase tracking-widest mb-1">When</p>
                <p class="text-sm font-bold text-gray-900 leading-snug">{{ formatDate(event.start) }}</p>
                <p class="text-sm text-gray-500">to {{ formatDate(event.end) }}</p>
              </div>
            </div>

            <!-- Location -->
            <div class="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-rose-50 p-2.5 text-rose-600 ring-1 ring-rose-100">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-bold text-gray-500 uppercase tracking-widest mb-1">Where</p>
                <p class="text-sm font-bold text-gray-900 leading-snug whitespace-pre-line">{{ event.location || 'Location TBD' }}</p>
              </div>
            </div>

            <!-- Cost -->
            <div class="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div class="flex-shrink-0 mt-0.5 rounded-lg bg-emerald-50 p-2.5 text-emerald-600 ring-1 ring-emerald-100">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                </svg>
              </div>
              <div>
                <p class="text-[13px] font-bold text-gray-500 uppercase tracking-widest mb-1">Price</p>
                <p class="text-sm font-bold text-gray-900 leading-snug">
                  {{ formatCurrency(event.cost, event.currency, { freeIfZero: true }) }}
                </p>
                <p class="text-sm text-gray-500">{{ event.cost ? 'Per person' : 'No cost to attend' }}</p>
              </div>
            </div>

            <!-- Join Mode -->
              <div v-if="event.joinMode === 1" class="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
                <div class="flex-shrink-0 mt-0.5 rounded-lg bg-amber-50 p-2.5 text-amber-600 ring-1 ring-amber-100">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
                <div class="min-w-0">
                  <p class="text-[13px] font-bold text-gray-500 uppercase tracking-widest mb-1">Access</p>
                  <p class="text-sm font-bold text-gray-900 leading-snug whitespace-nowrap">Invite Only</p>
                  <p class="text-sm text-gray-500">Requires an invitation</p>
                </div>
              </div>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="border-b border-gray-100 bg-white px-6 py-5 flex flex-col sm:flex-row gap-4 justify-between items-center z-10 relative">
          <div class="flex flex-col sm:flex-row items-center w-full sm:w-auto gap-3">
            <template v-if="!event.hasJoined">
              <div v-if="event.isBlocked" data-testid="event-blocked-msg" class="text-sm font-medium text-red-700 bg-red-50 rounded-lg px-4 py-2 border border-red-200">
                The host has removed you from this event and you can no longer join.
              </div>
              <template v-else>
              <button
                v-if="auth.isAuthenticated && (event.canJoin || event.hasInvitation)"
                data-testid="event-join-btn"
                @click="joinEvent"
                class="w-full sm:w-auto justify-center inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-500 hover:shadow-lg hover:-translate-y-0.5 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Join Event
              </button>
              <button
                v-else-if="!auth.isAuthenticated && event.joinMode !== 1"
                data-testid="event-join-btn-disabled"
                disabled
                class="w-full sm:w-auto justify-center inline-flex items-center gap-2 rounded-xl bg-indigo-300 px-8 py-3 text-sm font-bold text-white cursor-not-allowed"
              >
                Join Event
              </button>
              <div v-else-if="!event.hasInvitation && event.joinMode === 1" data-testid="event-invite-only-msg" class="text-sm font-medium text-gray-500 bg-gray-50 rounded-lg px-4 py-2 border border-gray-200">
                This event is invite only.
              </div>
              </template>
            </template>
            <template v-else>
              <button
                v-if="!isOwner"
                data-testid="event-leave-btn"
                @click="openLeaveDialog"
                class="w-full sm:w-auto justify-center rounded-xl bg-white px-6 py-3 text-sm font-bold text-slate-600 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 transition-all"
              >
                Leave Event
              </button>
              <button
                v-else
                data-testid="event-leave-btn-disabled"
                disabled
                title="Owners cannot leave their own event"
                class="w-full sm:w-auto justify-center rounded-xl bg-gray-100 px-6 py-3 text-sm font-bold text-gray-400 cursor-not-allowed ring-1 ring-inset ring-gray-200"
              >
                Leave Event
              </button>
              <AddToCalendarButton
                v-if="event?.hasJoined"
                data-testid="event-add-to-calendar-btn"
                :uid="`event-${event.id}@thuddle.app`"
                :title="event.title"
                :description="event.description"
                :location="event.location"
                :start="event.start"
                :end="event.end"
                :filename="`thuddle-event-${event.id}.ics`"
              />
            </template>
          </div>
          <div class="flex items-center justify-end w-full sm:w-auto">
            <RouterLink
              v-if="event.isAdmin"
              :to="{ name: 'manage-event', params: { id: event.id } }"
              data-testid="event-manage-link"
              class="w-full sm:w-auto flex justify-center items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-all"
            >
              <svg class="w-4 h-4 opacity-70" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
              Manage Event
            </RouterLink>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
          <EventTabBar :tabs="visibleTabs" :active-key="activeTab" @update:active-key="selectTab">
            <template #badge="{ tab }">
              <!-- Discussion: unread indicator + post count + pending badge -->
              <template v-if="tab.key === 'discussion'">
                <div v-if="event.postCount" class="ml-2.5 flex items-center transition-colors">
                  <div class="relative flex items-center justify-center px-2 py-0.5 rounded-md border text-xs font-semibold shadow-sm"
                       :class="(event.hasUnreadDiscussion && activeTab !== 'discussion') || activeTab === 'discussion' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-white text-gray-500 border-gray-200/60'">
                    <span v-if="event.hasUnreadDiscussion && activeTab !== 'discussion'" data-testid="discussion-unread-indicator" class="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 ring-2 ring-white"></span>
                    </span>
                    {{ event.postCount }}
                  </div>
                </div>
                <span v-if="event.pendingPostCount" class="ml-2 inline-flex items-center bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200/60 text-[10px] uppercase font-bold tracking-wider shadow-sm">
                  {{ event.pendingPostCount }} pending
                </span>
              </template>

              <!-- Attendees: participant count badge -->
              <template v-else-if="tab.key === 'attendees'">
                <div class="ml-2.5 flex items-center justify-center px-2 py-0.5 rounded-md border text-xs font-semibold shadow-sm transition-colors"
                     :class="activeTab === 'attendees' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-white text-gray-500 border-gray-200/60'">
                  {{ event.participantCount || 0 }}
                </div>
              </template>

              <!-- Auction: status badge -->
              <template v-else-if="tab.key === 'auction' && auctionStatus">
                <span
                  data-testid="event-auction-tab-status"
                  class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] uppercase font-bold tracking-wider"
                  :class="auctionStatusBadgeClass"
                >
                  {{ auctionStatus }}
                </span>
              </template>
            </template>
          </EventTabBar>
        </div>

        <!-- Tab: About -->
        <div v-if="activeTab === 'about'" class="px-6 py-5">
          <div v-if="event.description" data-testid="event-description" class="prose prose-sm max-w-none text-gray-700" v-html="event.description" />
          <p v-else data-testid="event-description-empty" class="text-sm text-gray-400">No description provided.</p>
        </div>

        <!-- Tab: Discussion -->
        <div v-if="activeTab === 'discussion'" class="px-6 py-5">
          <DiscussionTab :event-id="event.id" :is-admin="event.isAdmin" />
        </div>

        <!-- Tab: Attendees -->
        <div v-if="activeTab === 'attendees'" class="px-6 py-5">
          <div v-if="participantsLoading" class="text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center justify-center py-12">Loading attendees...</div>
          
          <div v-else-if="participants.length === 0" data-testid="participants-empty" class="text-center py-16 px-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 my-2">
             <div class="mx-auto w-16 h-16 rounded-full bg-slate-100 border border-slate-200/60 shadow-sm flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
             </div>
             <h3 class="text-sm font-bold text-slate-900 mb-1">No attendees yet</h3>
             <p class="text-xs text-slate-500 max-w-[200px] mx-auto leading-relaxed">Be the first to join this event!</p>
          </div>

          <ul v-else data-testid="participants-list" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <li
              v-for="p in participants"
              :key="p.keycloakId"
              data-testid="participant-item"
              class="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-default"
            >
              <img
                v-if="p.profilePictureUrl"
                :src="apiUrl(p.profilePictureUrl)"
                :alt="p.displayName"
                class="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200/50"
              />
              <span
                v-else
                class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/50 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] text-slate-500 flex items-center justify-center text-[13px] font-bold"
              >
                {{ p.displayName.charAt(0).toUpperCase() }}
              </span>
              <div class="flex-1 min-w-0">
                <span class="block text-[13px] font-bold text-slate-900 truncate tracking-tight">{{ p.displayName }}</span>
                <span
                  v-if="p.role === 'owner'"
                  data-testid="participant-role-owner"
                  class="inline-flex items-center rounded-full px-1.5 py-0.5 mt-0.5 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/60"
                >Owner</span>
                <span
                  v-else-if="p.role === 'co-host'"
                  data-testid="participant-role-co-host"
                  class="inline-flex items-center rounded-full px-1.5 py-0.5 mt-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200"
                >Co-host</span>
              </div>
            </li>
          </ul>
        </div>

        <!-- Tab: Raffles -->
        <div v-if="activeTab === 'raffles' && hasParticipantAccess && eventFeaturesStore.isEnabled(route.params.id, FeatureKeys.Raffles)" class="px-6 py-5" data-testid="event-raffles-tab">
          <RafflesSection
            :event-id="event.id"
            :is-host="event.isAdmin"
            :can-author="false"
            :currency="event.currency || ''"
          />
        </div>

        <!-- Tab: Activities -->
        <div v-if="activeTab === 'activities' && eventFeaturesStore.isEnabled(route.params.id, FeatureKeys.Activities) && auth.isAuthenticated && hasParticipantAccess" class="px-6 py-5" data-testid="activities-tab">
          <ActivitiesSection :event-id="event.id" />
        </div>

        <!-- Tab: Auction -->
        <div v-if="activeTab === 'auction' && eventFeaturesStore.isEnabled(route.params.id, FeatureKeys.Auction)" class="px-6 py-5" data-testid="event-auction-tab">
          <div class="rounded-2xl border border-indigo-100 bg-linear-to-br from-indigo-50/60 to-white p-6">
            <div class="flex items-start gap-4">
              <div class="w-12 h-12 rounded-xl bg-white border border-indigo-200/60 shadow-sm flex items-center justify-center shrink-0">
                <span class="text-2xl" aria-hidden="true">🔨</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <h3 class="text-base font-bold text-gray-900">Silent auction</h3>
                  <span
                    data-testid="event-auction-status-badge"
                    class="inline-flex items-center px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider rounded-md border"
                    :class="auctionStatusBadgeClass"
                  >
                    {{ auctionStatus || 'Draft' }}
                  </span>
                </div>
                <p class="text-sm text-gray-600 leading-relaxed mb-4">
                  <template v-if="auctionStatus === 'Live'">Bidding is open — place a bid before time runs out.</template>
                  <template v-else-if="auctionStatus === 'Scheduled'">The auction is scheduled. Take a look at the items on offer.</template>
                  <template v-else-if="auctionStatus === 'Ended'">The auction has ended. See the final results.</template>
                  <template v-else>Browse items and follow along as the auction goes live.</template>
                </p>
                <button
                  type="button"
                  data-testid="event-auction-link"
                  @click="goToAuction"
                  class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  View auction
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="leaveDialogOpen"
      title="Leave this event?"
      :message="leaveMessage"
      :warning="leaveTicketWarning"
      confirm-label="Leave"
      variant="danger"
      @confirm="confirmLeave"
      @cancel="leaveDialogOpen = false"
    />
  </div>
</template>
