<script setup>
import { ref, computed, shallowRef, onMounted, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { parseDecimalInput } from '@/shared/formatCurrency'

const route = useRoute()
const auctionStore = useAuctionStore()
const eventId = computed(() => String(route.params.id))

const { settingsByEvent, errorByEvent } = storeToRefs(auctionStore)
const settings = computed(() => settingsByEvent.value[eventId.value] || null)
const loadError = computed(() => errorByEvent.value[eventId.value])

// Enum integer mappings (server has no JsonStringEnumConverter)
const STATUS_INT = { Draft: 0, Scheduled: 1, Live: 2, Ended: 3 }
const SUB_MODE_INT = { AdminsOnly: 0, SelectedAttendees: 1, AllAttendees: 2 }
const MOD_POLICY_INT = { RequireApproval: 0, AutoApprove: 1 }

const form = ref({
  enabled: true,
  status: 'Draft',
  startsAt: '',
  latestEndsAt: '',
  veiledCloseWindowSeconds: 300,
  submissionMode: 'AllAttendees',
  itemModerationPolicy: 'RequireApproval',
  minBidIncrement: '1',
  allowBuyout: false,
  anonymousBidHistory: false
})

const saving = shallowRef(false)
const savedFlash = shallowRef(false)
const saveError = shallowRef('')
const startingNow = shallowRef(false)
const startError = shallowRef('')

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
  form.value.veiledCloseWindowSeconds = Number(s.veiledCloseWindow) || 0
  form.value.submissionMode = s.submissionMode || 'AllAttendees'
  form.value.itemModerationPolicy = s.itemModerationPolicy || 'RequireApproval'
  form.value.minBidIncrement = String(s.minBidIncrement ?? '1')
  form.value.allowBuyout = !!s.allowBuyout
  form.value.anonymousBidHistory = !!s.anonymousBidHistory
}

watch(settings, (val) => {
  if (val && val.configured) hydrate(val)
}, { immediate: true })

const isLive = computed(() => settings.value?.status === 'Live')
const isEnded = computed(() => settings.value?.status === 'Ended')
const isScheduled = computed(() => settings.value?.status === 'Scheduled')

// Most fields lock once Live; before-Live, everything is editable.
const editableField = computed(() => !isLive.value && !isEnded.value)

const startMs = computed(() => form.value.startsAt ? Date.parse(form.value.startsAt) : 0)
const endMs = computed(() => form.value.latestEndsAt ? Date.parse(form.value.latestEndsAt) : 0)
const durationSec = computed(() => Math.max(0, Math.floor((endMs.value - startMs.value) / 1000)))
const maxVeil = computed(() => Math.floor(durationSec.value / 2))

const fieldErrors = computed(() => {
  const errs = {}
  if (!form.value.startsAt) errs.startsAt = 'Required.'
  if (!form.value.latestEndsAt) errs.latestEndsAt = 'Required.'
  if (startMs.value && endMs.value && startMs.value >= endMs.value) {
    errs.latestEndsAt = 'Must be after start.'
  }
  if (form.value.veiledCloseWindowSeconds < 0) errs.veiledCloseWindowSeconds = 'Must be ≥ 0.'
  if (form.value.veiledCloseWindowSeconds > maxVeil.value) {
    errs.veiledCloseWindowSeconds = `Must be ≤ half the duration (${maxVeil.value}s).`
  }
  const mbi = parseDecimalInput(form.value.minBidIncrement)
  if (mbi === null || mbi <= 0) errs.minBidIncrement = 'Must be > 0.'
  return errs
})

const isValid = computed(() => Object.keys(fieldErrors.value).length === 0)

async function save() {
  if (!isValid.value) return
  saving.value = true
  saveError.value = ''
  savedFlash.value = false
  try {
    await auctionStore.updateSettings(eventId.value, {
      enabled: form.value.enabled,
      status: STATUS_INT[form.value.status] ?? 0,
      startsAt: fromLocalInput(form.value.startsAt),
      latestEndsAt: fromLocalInput(form.value.latestEndsAt),
      veiledCloseWindow: secondsToTimeSpan(form.value.veiledCloseWindowSeconds),
      submissionMode: SUB_MODE_INT[form.value.submissionMode] ?? 2,
      itemModerationPolicy: MOD_POLICY_INT[form.value.itemModerationPolicy] ?? 0,
      minBidIncrement: parseDecimalInput(form.value.minBidIncrement),
      allowBuyout: form.value.allowBuyout,
      anonymousBidHistory: form.value.anonymousBidHistory
    })
    savedFlash.value = true
    setTimeout(() => { savedFlash.value = false }, 2500)
  } catch (err) {
    saveError.value = err.message || 'Failed to save settings.'
  } finally {
    saving.value = false
  }
}

async function startNow() {
  startingNow.value = true
  startError.value = ''
  try {
    await auctionStore.startAuction(eventId.value)
  } catch (err) {
    startError.value = err.message || 'Failed to start auction.'
  } finally {
    startingNow.value = false
  }
}

onMounted(async () => {
  await auctionStore.loadAuction(eventId.value)
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'event', params: { id: eventId } }"
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
      <button
        v-if="isScheduled"
        type="button"
        data-testid="auction-start-btn"
        :disabled="startingNow"
        @click="startNow"
        class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        {{ startingNow ? 'Starting…' : 'Start auction now' }}
      </button>
    </div>

    <div v-if="loadError" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ loadError }}
    </div>
    <div v-if="startError" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ startError }}
    </div>

    <form
      data-testid="auction-settings-form"
      @submit.prevent="save"
      class="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div class="flex items-center gap-3">
        <input
          v-model="form.enabled"
          type="checkbox"
          data-testid="auction-settings-enabled"
          class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
        />
        <label class="text-sm font-bold text-gray-700">Auction enabled</label>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Starts at</label>
          <input
            v-model="form.startsAt"
            data-testid="auction-settings-starts-at"
            type="datetime-local"
            :disabled="!editableField"
            class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            :class="fieldErrors.startsAt ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
          />
          <p v-if="fieldErrors.startsAt" class="mt-1 text-xs text-red-600">{{ fieldErrors.startsAt }}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Latest end</label>
          <input
            v-model="form.latestEndsAt"
            data-testid="auction-settings-latest-ends-at"
            type="datetime-local"
            class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            :class="fieldErrors.latestEndsAt ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
          />
          <p v-if="fieldErrors.latestEndsAt" class="mt-1 text-xs text-red-600">{{ fieldErrors.latestEndsAt }}</p>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Veiled close window
          <span class="text-gray-400 font-normal">(seconds)</span>
        </label>
        <input
          v-model.number="form.veiledCloseWindowSeconds"
          data-testid="auction-settings-veil-window"
          type="number"
          min="0"
          :max="maxVeil"
          class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          :class="fieldErrors.veiledCloseWindowSeconds ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
        />
        <p v-if="fieldErrors.veiledCloseWindowSeconds" class="mt-1 text-xs text-red-600">{{ fieldErrors.veiledCloseWindowSeconds }}</p>
        <p v-else class="mt-1 text-[11px] text-gray-400">
          Set to 0 for a fixed-time auction. Maximum: half the auction duration ({{ maxVeil }}s).
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Submissions</label>
          <select
            v-model="form.submissionMode"
            data-testid="auction-settings-submission-mode"
            :disabled="!editableField"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="AdminsOnly">Admins only</option>
            <option value="SelectedAttendees">Selected attendees</option>
            <option value="AllAttendees">All attendees</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Item moderation</label>
          <select
            v-model="form.itemModerationPolicy"
            data-testid="auction-settings-moderation-policy"
            class="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="RequireApproval">Require admin approval</option>
            <option value="AutoApprove">Auto-approve</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Minimum bid increment</label>
          <input
            v-model="form.minBidIncrement"
            data-testid="auction-settings-min-increment"
            type="text"
            inputmode="decimal"
            class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            :class="fieldErrors.minBidIncrement ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
          />
          <p v-if="fieldErrors.minBidIncrement" class="mt-1 text-xs text-red-600">{{ fieldErrors.minBidIncrement }}</p>
        </div>
      </div>

      <div class="space-y-2 pt-2 border-t border-gray-100">
        <label class="flex items-center gap-3">
          <input
            v-model="form.allowBuyout"
            data-testid="auction-settings-allow-buyout"
            type="checkbox"
            class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span class="text-sm text-gray-700">Allow buyout</span>
        </label>
        <label class="flex items-center gap-3">
          <input
            v-model="form.anonymousBidHistory"
            data-testid="auction-settings-anonymous-history"
            type="checkbox"
            class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span class="text-sm text-gray-700">Hide submitter and bidder names</span>
        </label>
      </div>

      <div v-if="saveError" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {{ saveError }}
      </div>
      <div v-if="savedFlash" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
        Settings saved. Voilà!
      </div>

      <div class="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          type="submit"
          data-testid="auction-settings-save-btn"
          :disabled="saving || !isValid"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ saving ? 'Saving…' : 'Save settings' }}
        </button>
        <p v-if="isLive" class="text-xs text-amber-700 font-semibold">
          Auction is live. Some fields are locked.
        </p>
        <p v-if="isEnded" class="text-xs text-gray-500 font-semibold">
          Auction has ended.
        </p>
      </div>
    </form>
  </div>
</template>
