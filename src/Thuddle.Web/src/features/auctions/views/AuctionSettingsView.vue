<script setup>
import { ref, computed, shallowRef, onMounted, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useEventsStore } from '@/features/events/stores/events'
import { useApi } from '@/shared/composables/useApi'
import { parseDecimalInput } from '@/shared/formatCurrency'
import AuctionTimeline from '@/features/auctions/components/AuctionTimeline.vue'
import SubmitterTransferPanel from '@/features/auctions/components/SubmitterTransferPanel.vue'

const route = useRoute()
const auctionStore = useAuctionStore()
const eventsStore = useEventsStore()
const { byId: eventsById } = storeToRefs(eventsStore)
const { authFetch } = useApi()
const slug = computed(() => String(route.params.slug))
const eventId = computed(() => eventsStore.slugToId[slug.value] ?? null)

const { settingsByEvent, errorByEvent } = storeToRefs(auctionStore)
const settings = computed(() => settingsByEvent.value[eventId.value] || null)
const loadError = computed(() => errorByEvent.value[eventId.value])

// Enum integer mappings (server has no JsonStringEnumConverter)
const SUB_MODE_INT = { AdminsOnly: 0, SelectedAttendees: 1, AllAttendees: 2 }
const MOD_POLICY_INT = { RequireApproval: 0, AutoApprove: 1 }

const form = ref({
  enabled: true,
  status: 'Draft',
  startsAt: '',
  latestEndsAt: '',
  veiledCloseEnabled: false,
  veiledCloseValue: 5,
  veiledCloseUnit: 'minutes',
  bidTimeExtensionEnabled: false,
  bidTimeExtensionValue: 5,
  bidTimeExtensionUnit: 'minutes',
  submissionMode: 'AllAttendees',
  itemModerationPolicy: 'RequireApproval',
  minBidIncrement: '1',
  allowBuyout: false,
  anonymousBidders: false,
  anonymousSubmitters: false
})

const saving = shallowRef(false)
const savedFlash = shallowRef(false)
const saveError = shallowRef('')
const activeTab = shallowRef('schedule')

const allAttendees = ref([])
const selectedSubmitterIds = ref(new Set())
const initialSubmitterIds = ref(new Set())
const pinnedAdminIds = ref(new Set())
const pinnedLabels = ref({})
const loadingSubmitters = shallowRef(false)
const submittersLoaded = shallowRef(false)

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(local) {
  if (!local) return null
  return new Date(local).toISOString()
}

function secondsToTimeSpan(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function hydrate(s) {
  if (!s) return
  form.value.enabled = !!s.enabled
  form.value.status = s.status || 'Draft'
  form.value.startsAt = toLocalInput(s.startsAt)
  form.value.latestEndsAt = toLocalInput(s.latestEndsAt)
  if (s.veiledCloseWindow != null) {
    form.value.veiledCloseEnabled = true
    const sec = Number(s.veiledCloseWindow)
    if (sec >= 60 && sec % 60 === 0) {
      form.value.veiledCloseValue = sec / 60
      form.value.veiledCloseUnit = 'minutes'
    } else {
      form.value.veiledCloseValue = sec
      form.value.veiledCloseUnit = 'seconds'
    }
  } else {
    form.value.veiledCloseEnabled = false
    form.value.veiledCloseValue = 5
    form.value.veiledCloseUnit = 'minutes'
  }
  if (s.bidTimeExtension != null) {
    form.value.bidTimeExtensionEnabled = true
    const sec = Number(s.bidTimeExtension)
    if (sec >= 60 && sec % 60 === 0) {
      form.value.bidTimeExtensionValue = sec / 60
      form.value.bidTimeExtensionUnit = 'minutes'
    } else {
      form.value.bidTimeExtensionValue = sec
      form.value.bidTimeExtensionUnit = 'seconds'
    }
  } else {
    form.value.bidTimeExtensionEnabled = false
    form.value.bidTimeExtensionValue = 5
    form.value.bidTimeExtensionUnit = 'minutes'
  }
  form.value.submissionMode = s.submissionMode || 'AllAttendees'
  form.value.itemModerationPolicy = s.itemModerationPolicy || 'RequireApproval'
  form.value.minBidIncrement = String(s.minBidIncrement ?? '1')
  form.value.allowBuyout = !!s.allowBuyout
  form.value.anonymousBidders = !!s.anonymousBidders
  form.value.anonymousSubmitters = !!s.anonymousSubmitters
}

watch(settings, (val) => {
  if (val && val.configured) hydrate(val)
}, { immediate: true })

const isLive = computed(() => settings.value?.status === 'Live')
const isEnded = computed(() => settings.value?.status === 'Ended')

// Most fields lock once Live; before-Live, everything is editable.
const editableField = computed(() => !isLive.value && !isEnded.value)

const eventStart = computed(() => settings.value?.eventStart ? new Date(settings.value.eventStart) : null)
const eventEnd = computed(() => settings.value?.eventEnd ? new Date(settings.value.eventEnd) : null)
const eventStartLocal = computed(() => eventStart.value ? toLocalInput(eventStart.value.toISOString()) : '')
const eventEndLocal = computed(() => eventEnd.value ? toLocalInput(eventEnd.value.toISOString()) : '')

const startMs = computed(() => form.value.startsAt ? Date.parse(form.value.startsAt) : 0)
const endMs = computed(() => form.value.latestEndsAt ? Date.parse(form.value.latestEndsAt) : 0)
const durationSec = computed(() => Math.max(0, Math.floor((endMs.value - startMs.value) / 1000)))
const maxVeil = computed(() => Math.floor(durationSec.value / 2))

const veiledCloseSeconds = computed(() =>
  form.value.veiledCloseValue * (form.value.veiledCloseUnit === 'minutes' ? 60 : 1)
)
const bidTimeExtensionSeconds = computed(() =>
  form.value.bidTimeExtensionValue * (form.value.bidTimeExtensionUnit === 'minutes' ? 60 : 1)
)

const fieldErrors = computed(() => {
  const errs = {}
  if (!form.value.startsAt) errs.startsAt = 'Required.'
  else if (eventStart.value && new Date(form.value.startsAt) < eventStart.value) {
    errs.startsAt = 'Cannot be before event start.'
  }
  if (!form.value.latestEndsAt) errs.latestEndsAt = 'Required.'
  else if (eventEnd.value && new Date(form.value.latestEndsAt) > eventEnd.value) {
    errs.latestEndsAt = 'Cannot be after event end.'
  }
  if (startMs.value && endMs.value && startMs.value >= endMs.value) {
    errs.latestEndsAt = 'Must be after start.'
  }
  if (form.value.veiledCloseEnabled) {
    if (veiledCloseSeconds.value <= 0) errs.veiledClose = 'Must be greater than 0.'
    else if (veiledCloseSeconds.value > maxVeil.value) {
      errs.veiledClose = `Must be ≤ half the duration (${maxVeil.value}s).`
    }
  }
  if (form.value.bidTimeExtensionEnabled) {
    if (bidTimeExtensionSeconds.value <= 0) errs.bidTimeExtension = 'Must be greater than 0.'
    else if (bidTimeExtensionSeconds.value > 1800) errs.bidTimeExtension = 'Must be ≤ 30 minutes.'
  }
  const mbi = parseDecimalInput(form.value.minBidIncrement)
  if (mbi === null || mbi <= 0) errs.minBidIncrement = 'Must be > 0.'
  return errs
})

const isValid = computed(() => Object.keys(fieldErrors.value).length === 0)

const submittersDirty = computed(() => {
  if (selectedSubmitterIds.value.size !== initialSubmitterIds.value.size) return true
  for (const id of selectedSubmitterIds.value) {
    if (!initialSubmitterIds.value.has(id)) return true
  }
  return false
})

const showSubmittersTab = computed(() => form.value.submissionMode === 'SelectedAttendees')

async function loadSubmitterData() {
  loadingSubmitters.value = true
  try {
    const [attendeesResp, submitters] = await Promise.all([
      authFetch(`/api/events/${eventId.value}/attendees`).then((r) => r.json()),
      auctionStore.getSubmitters(eventId.value)
    ])
    allAttendees.value = (attendeesResp.attendees || []).map((a) => ({
      userId: a.userId,
      displayName: a.displayName,
      email: a.email
    }))
    const ids = new Set((submitters || []).map((s) => s.userId))
    selectedSubmitterIds.value = new Set(ids)
    initialSubmitterIds.value = new Set(ids)

    const ownerId = eventsById.value[eventId.value]?.ownerId
    const pinned = new Set()
    const labels = {}
    if (ownerId) {
      pinned.add(ownerId)
      labels[ownerId] = '(owner)'
    }
    for (const ca of attendeesResp.coAdmins || []) {
      pinned.add(ca.userId)
      labels[ca.userId] = '(co-host)'
      if (!allAttendees.value.some((a) => a.userId === ca.userId)) {
        allAttendees.value.push({ userId: ca.userId, displayName: ca.displayName, email: ca.email })
      }
    }
    pinnedAdminIds.value = pinned
    pinnedLabels.value = labels
    submittersLoaded.value = true
  } catch {
    // silently fail — the tab will just be empty
  } finally {
    loadingSubmitters.value = false
  }
}

watch(showSubmittersTab, (val) => {
  if (val && !submittersLoaded.value) loadSubmitterData()
  if (!val && activeTab.value === 'submitters') activeTab.value = 'rules'
})

function onSubmitterAdd(userId) {
  const next = new Set(selectedSubmitterIds.value)
  next.add(userId)
  selectedSubmitterIds.value = next
}

function onSubmitterRemove(userId) {
  const next = new Set(selectedSubmitterIds.value)
  next.delete(userId)
  selectedSubmitterIds.value = next
}

async function save() {
  if (!isValid.value) return
  saving.value = true
  saveError.value = ''
  savedFlash.value = false
  try {
    await auctionStore.updateSettings(eventId.value, {
      enabled: form.value.enabled,
      startsAt: fromLocalInput(form.value.startsAt),
      latestEndsAt: fromLocalInput(form.value.latestEndsAt),
      veiledCloseWindow: form.value.veiledCloseEnabled ? secondsToTimeSpan(veiledCloseSeconds.value) : null,
      bidTimeExtension: form.value.bidTimeExtensionEnabled ? secondsToTimeSpan(bidTimeExtensionSeconds.value) : null,
      submissionMode: SUB_MODE_INT[form.value.submissionMode] ?? 2,
      itemModerationPolicy: MOD_POLICY_INT[form.value.itemModerationPolicy] ?? 0,
      minBidIncrement: parseDecimalInput(form.value.minBidIncrement),
      allowBuyout: form.value.allowBuyout,
      anonymousBidders: form.value.anonymousBidders,
      anonymousSubmitters: form.value.anonymousSubmitters
    })
    if (form.value.submissionMode === 'SelectedAttendees' && submittersDirty.value) {
      await auctionStore.setSubmitters(eventId.value, [...selectedSubmitterIds.value])
      initialSubmitterIds.value = new Set(selectedSubmitterIds.value)
    }
    savedFlash.value = true
    setTimeout(() => { savedFlash.value = false }, 2500)
  } catch (err) {
    saveError.value = err.message || 'Failed to save settings.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  if (!eventId.value) {
    await eventsStore.loadEventBySlug(slug.value)
  }
  await auctionStore.loadAuction(eventId.value)
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'event', params: { slug: slug } }"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to event
    </RouterLink>

    <div class="mb-6 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-extrabold text-gray-900">Auction settings</h1>
        <p v-if="settings" class="mt-1 text-sm text-gray-500">
          Status: <span class="font-bold text-gray-700">{{ settings.status || '—' }}</span>
        </p>
      </div>
    </div>

    <div v-if="loadError" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ loadError }}
    </div>
    <form
      data-testid="auction-settings-form"
      @submit.prevent="save"
      class="space-y-5"
    >
      <!-- Top card: enabled toggle + locked banner + timeline -->
      <div class="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
        <div class="flex items-center gap-3">
          <input
            v-model="form.enabled"
            type="checkbox"
            data-testid="auction-settings-enabled"
            :disabled="!editableField"
            class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <label class="text-sm font-bold" :class="editableField ? 'text-gray-700' : 'text-gray-400'">Auction enabled</label>
        </div>
        <div
          v-if="isLive || isEnded"
          data-testid="auction-settings-locked-banner"
          role="status"
          class="rounded-xl p-4 flex items-start gap-3"
          :class="isLive ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'"
        >
          <svg class="w-6 h-6 shrink-0 mt-0.5" :class="isLive ? 'text-amber-600' : 'text-gray-400'" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <div>
            <p class="text-sm font-bold" :class="isLive ? 'text-amber-800' : 'text-gray-700'">
              {{ isLive ? 'Settings locked' : 'Auction ended' }}
            </p>
            <p class="text-sm mt-0.5" :class="isLive ? 'text-amber-700' : 'text-gray-500'">
              {{ isLive ? 'All settings are locked while the auction is live. Changes could only be made before the start time.' : 'The auction has ended. Settings can no longer be changed.' }}
            </p>
          </div>
        </div>

        <AuctionTimeline
          v-if="form.startsAt && form.latestEndsAt && durationSec > 0"
          :starts-at="fromLocalInput(form.startsAt)"
          :latest-ends-at="fromLocalInput(form.latestEndsAt)"
          :veiled-close-window-seconds="form.veiledCloseEnabled ? veiledCloseSeconds : 0"
          :status="form.status"
          :show-total-duration="true"
          :bid-time-extension-seconds="form.bidTimeExtensionEnabled ? bidTimeExtensionSeconds : 0"
          data-testid="auction-settings-duration-timeline"
        />
      </div>

      <!-- Tab container -->
      <div class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <!-- Tab bar -->
        <div class="flex border-b border-gray-200" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'schedule'"
            data-testid="auction-settings-tab-schedule"
            @click="activeTab = 'schedule'"
            class="flex-1 border-b-2 px-4 py-3 text-sm font-semibold transition-colors"
            :class="activeTab === 'schedule' ? 'border-indigo-500 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          >
            <svg v-if="isLive || isEnded" class="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Schedule
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="activeTab === 'rules'"
            data-testid="auction-settings-tab-rules"
            @click="activeTab = 'rules'"
            class="flex-1 border-b-2 px-4 py-3 text-sm font-semibold transition-colors"
            :class="activeTab === 'rules' ? 'border-indigo-500 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          >
            <svg v-if="isLive || isEnded" class="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Rules & privacy
          </button>
          <Transition name="tab-slide">
            <button
              v-if="showSubmittersTab"
              type="button"
              role="tab"
              :aria-selected="activeTab === 'submitters'"
              data-testid="auction-settings-tab-submitters"
              @click="activeTab = 'submitters'"
              class="flex-1 border-b-2 px-4 py-3 text-sm font-semibold transition-colors"
              :class="activeTab === 'submitters' ? 'border-indigo-500 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              Submitters
            </button>
          </Transition>
        </div>

        <!-- Tab: Schedule -->
        <div v-if="activeTab === 'schedule'" role="tabpanel" class="p-6 space-y-5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1" :class="editableField ? 'text-gray-700' : 'text-gray-400'">Starts at</label>
              <input
                v-model="form.startsAt"
                data-testid="auction-settings-starts-at"
                type="datetime-local"
                :disabled="!editableField"
                :min="eventStartLocal"
                :max="eventEndLocal"
                class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                :class="fieldErrors.startsAt ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
              />
              <p v-if="fieldErrors.startsAt" class="mt-1 text-xs text-red-600">{{ fieldErrors.startsAt }}</p>
              <p v-else class="mt-1 text-[11px] text-gray-400">When bidding opens. Must fall within the event's timeframe.</p>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1" :class="editableField ? 'text-gray-700' : 'text-gray-400'">Latest end</label>
              <input
                v-model="form.latestEndsAt"
                data-testid="auction-settings-latest-ends-at"
                type="datetime-local"
                :disabled="!editableField"
                :min="eventStartLocal"
                :max="eventEndLocal"
                class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                :class="fieldErrors.latestEndsAt ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
              />
              <p v-if="fieldErrors.latestEndsAt" class="mt-1 text-xs text-red-600">{{ fieldErrors.latestEndsAt }}</p>
              <p v-else class="mt-1 text-[11px] text-gray-400">The latest possible time the auction can close. Must fall within the event's timeframe.</p>
            </div>
          </div>

          <div data-testid="auction-anti-sniping-section" class="space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-bold text-gray-800">Anti-sniping</h3>
            </div>
            <p class="text-xs text-gray-500 -mt-2">Prevent last-second bidding strategies that disadvantage other participants.</p>

            <!-- Veiled Close Window -->
            <div class="space-y-2">
              <label class="flex items-center gap-2">
                <input
                  v-model="form.veiledCloseEnabled"
                  data-testid="auction-veiled-close-toggle"
                  type="checkbox"
                  :disabled="!editableField"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span class="text-sm font-medium" :class="editableField ? 'text-gray-700' : 'text-gray-400'">Enable veiled close</span>
              </label>
              <p class="text-[11px] text-gray-400 ml-6">The auction ends at a random time within this window before the deadline, so bidders can't time last-second bids.</p>
              <div v-if="form.veiledCloseEnabled" class="ml-6 flex items-start gap-2">
                <input
                  v-model.number="form.veiledCloseValue"
                  data-testid="auction-veiled-close-value"
                  type="number"
                  min="1"
                  :disabled="!editableField"
                  class="w-24 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  :class="fieldErrors.veiledClose ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
                />
                <select
                  v-model="form.veiledCloseUnit"
                  data-testid="auction-veiled-close-unit"
                  :disabled="!editableField"
                  class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="seconds">seconds</option>
                  <option value="minutes">minutes</option>
                </select>
              </div>
              <p v-if="fieldErrors.veiledClose" class="ml-6 text-xs text-red-600">{{ fieldErrors.veiledClose }}</p>
              <p v-else-if="form.veiledCloseEnabled" class="ml-6 text-[11px] text-gray-400">Maximum: half the auction duration.</p>
            </div>

            <!-- Bid Time Extension -->
            <div class="space-y-2 border-t border-amber-200 pt-4">
              <label class="flex items-center gap-2">
                <input
                  v-model="form.bidTimeExtensionEnabled"
                  data-testid="auction-bid-extension-toggle"
                  type="checkbox"
                  :disabled="!editableField"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span class="text-sm font-medium" :class="editableField ? 'text-gray-700' : 'text-gray-400'">Enable bid time extension</span>
              </label>
              <p class="text-[11px] text-gray-400 ml-6">When a bid is placed near the end of an item's deadline, extra time is added so others can respond.</p>
              <div v-if="form.bidTimeExtensionEnabled" class="ml-6 flex items-start gap-2">
                <input
                  v-model.number="form.bidTimeExtensionValue"
                  data-testid="auction-bid-extension-value"
                  type="number"
                  min="1"
                  :disabled="!editableField"
                  class="w-24 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  :class="fieldErrors.bidTimeExtension ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
                />
                <select
                  v-model="form.bidTimeExtensionUnit"
                  data-testid="auction-bid-extension-unit"
                  :disabled="!editableField"
                  class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  <option value="seconds">seconds</option>
                  <option value="minutes">minutes</option>
                </select>
              </div>
              <p v-if="fieldErrors.bidTimeExtension" class="ml-6 text-xs text-red-600">{{ fieldErrors.bidTimeExtension }}</p>
              <p v-else-if="form.bidTimeExtensionEnabled" class="ml-6 text-[11px] text-gray-400">Maximum: 30 minutes.</p>
            </div>
          </div>

          <div class="flex justify-end pt-2">
            <button
              type="button"
              data-testid="auction-settings-next-tab"
              @click="activeTab = 'rules'"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Rules &amp; privacy
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Tab: Rules & privacy -->
        <div v-if="activeTab === 'rules'" role="tabpanel" class="divide-y divide-gray-100">

          <!-- Submissions -->
          <div class="flex flex-col sm:flex-row sm:gap-6 p-6">
            <div class="sm:w-1/2">
              <label class="block text-sm font-semibold mb-1.5" :class="editableField ? 'text-gray-900' : 'text-gray-400'">Submissions</label>
              <select
                v-model="form.submissionMode"
                data-testid="auction-settings-submission-mode"
                :disabled="!editableField"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                <option value="AdminsOnly">Admins only</option>
                <option value="SelectedAttendees">Selected attendees</option>
                <option value="AllAttendees">All attendees</option>
              </select>
            </div>
            <div class="mt-2 sm:mt-0 sm:w-1/2 sm:border-l sm:border-gray-100 sm:pl-6 flex items-center">
              <div>
                <p class="text-sm text-gray-500">Who is allowed to submit items for auction.</p>
                <p v-if="form.submissionMode === 'SelectedAttendees'" class="text-sm text-gray-500 mt-1">
                  Choose which attendees may submit items.
                  <button type="button" @click="activeTab = 'submitters'" class="text-indigo-600 hover:text-indigo-700 font-semibold">
                    Manage submitters →
                  </button>
                </p>
              </div>
            </div>
          </div>

          <!-- Item moderation -->
          <div class="flex flex-col sm:flex-row sm:gap-6 p-6">
            <div class="sm:w-1/2">
              <label class="block text-sm font-semibold mb-1.5" :class="editableField ? 'text-gray-900' : 'text-gray-400'">Item moderation</label>
              <select
                v-model="form.itemModerationPolicy"
                data-testid="auction-settings-moderation-policy"
                :disabled="!editableField"
                class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                <option value="RequireApproval">Require admin approval</option>
                <option value="AutoApprove">Auto-approve</option>
              </select>
            </div>
            <div class="mt-2 sm:mt-0 sm:w-1/2 sm:border-l sm:border-gray-100 sm:pl-6 flex items-center">
              <p class="text-sm text-gray-500">Whether submitted items need admin approval before being listed.</p>
            </div>
          </div>

          <!-- Minimum bid increment -->
          <div class="flex flex-col sm:flex-row sm:gap-6 p-6">
            <div class="sm:w-1/2">
              <label class="block text-sm font-semibold mb-1.5" :class="editableField ? 'text-gray-900' : 'text-gray-400'">Minimum bid increment</label>
              <div class="flex items-stretch">
                <input
                  v-model="form.minBidIncrement"
                  data-testid="auction-settings-min-increment"
                  type="text"
                  inputmode="decimal"
                  :disabled="!editableField"
                  class="w-full rounded-l-lg border border-r-0 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  :class="fieldErrors.minBidIncrement ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
                />
                <span class="inline-flex items-center rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                  {{ settings?.currency || 'EUR' }}
                </span>
              </div>
              <p v-if="fieldErrors.minBidIncrement" class="mt-1 text-xs text-red-600">{{ fieldErrors.minBidIncrement }}</p>
            </div>
            <div class="mt-2 sm:mt-0 sm:w-1/2 sm:border-l sm:border-gray-100 sm:pl-6 flex items-center">
              <p class="text-sm text-gray-500">The minimum amount each new bid must exceed the current highest bid.</p>
            </div>
          </div>

          <!-- Allow buyout -->
          <div class="flex flex-col sm:flex-row sm:gap-6 p-6">
            <div class="sm:w-1/2">
              <label class="flex items-center gap-3">
                <input
                  v-model="form.allowBuyout"
                  data-testid="auction-settings-allow-buyout"
                  type="checkbox"
                  :disabled="!editableField"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span class="text-sm font-semibold" :class="editableField ? 'text-gray-900' : 'text-gray-400'">Allow buyout</span>
              </label>
            </div>
            <div class="mt-2 ml-9 sm:ml-0 sm:mt-0 sm:w-1/2 sm:border-l sm:border-gray-100 sm:pl-6 flex items-center">
              <p class="text-sm text-gray-500">Allow item submitters to set an optional buyout price. Bidders can then instantly win the item by paying that price.</p>
            </div>
          </div>

          <!-- Anonymous bidders -->
          <div class="flex flex-col sm:flex-row sm:gap-6 p-6">
            <div class="sm:w-1/2">
              <label class="flex items-center gap-3">
                <input
                  v-model="form.anonymousBidders"
                  data-testid="auction-settings-anonymous-bidders"
                  type="checkbox"
                  :disabled="!editableField"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span class="text-sm font-semibold" :class="editableField ? 'text-gray-900' : 'text-gray-400'">Anonymous bidders</span>
              </label>
            </div>
            <div class="mt-2 ml-9 sm:ml-0 sm:mt-0 sm:w-1/2 sm:border-l sm:border-gray-100 sm:pl-6 flex items-center">
              <p class="text-sm text-gray-500">Hide bidder identities from other participants. Event admins can always see who placed each bid.</p>
            </div>
          </div>

          <!-- Anonymous submitters -->
          <div class="flex flex-col sm:flex-row sm:gap-6 p-6">
            <div class="sm:w-1/2">
              <label class="flex items-center gap-3">
                <input
                  v-model="form.anonymousSubmitters"
                  data-testid="auction-settings-anonymous-submitters"
                  type="checkbox"
                  :disabled="!editableField"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span class="text-sm font-semibold" :class="editableField ? 'text-gray-900' : 'text-gray-400'">Anonymous submitters</span>
              </label>
            </div>
            <div class="mt-2 ml-9 sm:ml-0 sm:mt-0 sm:w-1/2 sm:border-l sm:border-gray-100 sm:pl-6 flex items-center">
              <p class="text-sm text-gray-500">Hide who submitted each item from other participants. Submitters can still see their own items, and event admins can always see all submitter identities.</p>
            </div>
          </div>

          <!-- Previous / next tab buttons -->
          <div class="flex justify-between p-6">
            <button
              type="button"
              data-testid="auction-settings-prev-tab"
              @click="activeTab = 'schedule'"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Schedule
            </button>
            <button
              v-if="showSubmittersTab"
              type="button"
              @click="activeTab = 'submitters'"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Submitters
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Tab: Submitters -->
        <div v-if="activeTab === 'submitters'" role="tabpanel" class="p-6">
          <div v-if="loadingSubmitters" class="text-center py-12 text-sm text-gray-400">Loading attendees…</div>
          <SubmitterTransferPanel
            v-else
            :attendees="allAttendees"
            :selected-ids="selectedSubmitterIds"
            :pinned-ids="pinnedAdminIds"
            :pinned-labels="pinnedLabels"
            :disabled="false"
            @add="onSubmitterAdd"
            @remove="onSubmitterRemove"
          />

          <div class="flex justify-start pt-5">
            <button
              type="button"
              @click="activeTab = 'rules'"
              class="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Rules &amp; privacy
            </button>
          </div>
        </div>
      </div>

      <!-- Save area (always visible) -->
      <div class="space-y-3">
        <div v-if="saveError" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {{ saveError }}
        </div>
        <div v-if="savedFlash" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Settings saved. Voilà!
        </div>
        <div class="flex items-center gap-3">
          <button
            type="submit"
            data-testid="auction-settings-save-btn"
            :disabled="saving || !isValid || !editableField"
            class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ saving ? 'Saving…' : 'Save settings' }}
          </button>
          <p v-if="isLive" class="text-xs text-amber-700 font-semibold">
            Settings are locked while the auction is live.
          </p>
          <p v-if="isEnded" class="text-xs text-gray-500 font-semibold">
            Auction has ended.
          </p>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.tab-slide-enter-active,
.tab-slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.tab-slide-enter-from,
.tab-slide-leave-to {
  max-width: 0;
  padding-left: 0;
  padding-right: 0;
  opacity: 0;
}
.tab-slide-enter-to,
.tab-slide-leave-from {
  max-width: 12rem;
  opacity: 1;
}
</style>
