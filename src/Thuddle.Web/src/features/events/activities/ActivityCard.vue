<script setup>
import { ref, computed } from 'vue'
import { useActivitiesStore } from './store'
import { useEventsStore } from '@/features/events/stores/events'
import AddToCalendarButton from '@/features/events/components/AddToCalendarButton.vue'
import ExpandableHtml from '@/shared/components/ExpandableHtml.vue'
import ParticipantChip from '@/shared/components/ParticipantChip.vue'
import RemoveParticipantDialog from './RemoveParticipantDialog.vue'
import ReplaceFromWaitlistDialog from './ReplaceFromWaitlistDialog.vue'
import { formatRelative } from '@/shared/utils/relativeTime'

const props = defineProps({
  activity: { type: Object, required: true },
  eventId: { type: String, required: true },
  parentEventLocation: { type: String, default: null }
})

const store = useActivitiesStore()
const eventsStore = useEventsStore()

const signupError = ref(null)
const signupLoading = ref(false)
const waitlistLoading = ref(false)
const waitlistError = ref(null)
const joinedOpen = ref(false)
const waitlistOpen = ref(false)
const participantsFetched = ref(false)

const removeDialogOpen = ref(false)
const replaceDialogOpen = ref(false)
const dialogParticipant = ref(null)

const currentEvent = computed(() => eventsStore.byId?.[props.eventId])
const isAdmin = computed(() => currentEvent.value?.isAdmin ?? false)
const hasParticipantAccess = computed(() => (currentEvent.value?.hasJoined ?? false) || isAdmin.value)
const isFullWithWaitlist = computed(() =>
  props.activity.maxParticipants > 0 &&
  props.activity.participantCount >= props.activity.maxParticipants &&
  (props.activity.waitlistCount ?? 0) > 0
)

const participants = computed(() => {
  const list = store.participants.get(props.activity.id) ?? []
  return [...list].sort((a, b) => new Date(a.signedUpAt) - new Date(b.signedUpAt))
})

const waitlist = computed(() => store.waitlistByActivity.get(props.activity.id) ?? [])

function formatActivityTime(startsAt, endsAt) {
  if (!startsAt) return ''
  const start = new Date(startsAt)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = `${weekdays[start.getDay()]} ${start.getDate()} ${months[start.getMonth()]}`
  const startTime = `${pad(start.getHours())}:${pad(start.getMinutes())}`
  if (!endsAt) return `${dateStr}, ${startTime}`
  const end = new Date(endsAt)
  const endTime = `${pad(end.getHours())}:${pad(end.getMinutes())}`
  return `${dateStr}, ${startTime}–${endTime}`
}

function capacityPercent(activity) {
  if (!activity.maxParticipants) return 0
  return Math.min(100, (activity.participantCount / activity.maxParticipants) * 100)
}

async function toggleJoined() {
  joinedOpen.value = !joinedOpen.value
  if (joinedOpen.value && !participantsFetched.value) {
    participantsFetched.value = true
    try {
      await store.fetchActivity(props.eventId, props.activity.id)
    } catch { /* best-effort */ }
  }
}

async function toggleWaitlist() {
  waitlistOpen.value = !waitlistOpen.value
  if (waitlistOpen.value && !participantsFetched.value) {
    participantsFetched.value = true
    try {
      await store.fetchActivity(props.eventId, props.activity.id)
    } catch { /* best-effort */ }
  }
}

async function handleSignup() {
  signupError.value = null
  signupLoading.value = true
  try {
    await store.signup(props.eventId, props.activity.id)
  } catch (err) {
    signupError.value = err.message || 'Failed to sign up.'
  } finally {
    signupLoading.value = false
  }
}

async function handleWithdraw() {
  signupError.value = null
  signupLoading.value = true
  try {
    await store.withdraw(props.eventId, props.activity.id)
  } catch (err) {
    signupError.value = err.message || 'Failed to withdraw.'
  } finally {
    signupLoading.value = false
  }
}

async function handleJoinWaitlist() {
  waitlistError.value = null
  waitlistLoading.value = true
  try {
    await store.joinWaitlist(props.eventId, props.activity.id)
  } catch (err) {
    waitlistError.value = err.message || 'Failed to join waitlist.'
  } finally {
    waitlistLoading.value = false
  }
}

async function handleLeaveWaitlist() {
  waitlistError.value = null
  waitlistLoading.value = true
  try {
    await store.leaveWaitlist(props.eventId, props.activity.id)
  } catch (err) {
    waitlistError.value = err.message || 'Failed to leave waitlist.'
  } finally {
    waitlistLoading.value = false
  }
}

function openRemoveDialog(participant) {
  dialogParticipant.value = participant
  removeDialogOpen.value = true
}

function openReplaceDialog(participant) {
  dialogParticipant.value = participant
  replaceDialogOpen.value = true
}

function onFallBackToRemove() {
  removeDialogOpen.value = true
}
</script>

<template>
  <div
    :data-testid="`activity-card-${activity.id}`"
    class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
  >
    <div class="px-5 py-4 space-y-3">
      <!-- Header row: title + hidden badge + time -->
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
        <div class="flex items-center gap-2 flex-wrap">
          <h4
            data-testid="activity-card-title"
            class="text-sm font-bold text-gray-900 leading-snug"
          >
            {{ activity.title }}
          </h4>
          <span
            v-if="activity.hiddenFromNonParticipants && isAdmin"
            :data-testid="`activity-hidden-badge-${activity.id}`"
            class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200"
          >
            Hidden
          </span>
        </div>
        <span
          data-testid="activity-card-time"
          class="text-xs text-gray-500 font-medium sm:shrink-0"
        >
          {{ formatActivityTime(activity.startsAt, activity.endsAt) }}
        </span>
      </div>

      <!-- Capacity bar -->
      <div
        v-if="activity.maxParticipants"
        data-testid="activity-card-capacity"
        class="space-y-1"
      >
        <span class="text-xs text-gray-500">
          {{ activity.participantCount }} / {{ activity.maxParticipants }} signed up
          <template v-if="activity.waitlistCount">
            · {{ activity.waitlistCount }} on waitlist
          </template>
        </span>
        <div
          role="progressbar"
          :aria-valuenow="activity.participantCount"
          :aria-valuemin="0"
          :aria-valuemax="activity.maxParticipants"
          :aria-label="`${activity.participantCount} of ${activity.maxParticipants} signed up`"
          class="h-2 rounded-full bg-gray-200 overflow-hidden"
        >
          <div
            class="h-full rounded-full bg-indigo-500 transition-all duration-300"
            :style="{ width: `${capacityPercent(activity)}%` }"
          />
        </div>
      </div>
      <div
        v-else
        data-testid="activity-card-capacity-unlimited"
        class="text-xs text-gray-500"
      >
        ∞ Unlimited spots
      </div>

      <!-- Description (expandable) -->
      <ExpandableHtml
        v-if="activity.description"
        :html="activity.description"
      />

      <!-- Footer: action buttons -->
      <div class="pt-1">
        <!-- Inline errors -->
        <p v-if="signupError" class="mb-2 text-xs text-red-600">{{ signupError }}</p>
        <p v-if="waitlistError" class="mb-2 text-xs text-red-600">{{ waitlistError }}</p>

        <!-- Already signed up → Withdraw + Add to calendar -->
        <div v-if="activity.mySignupAt" class="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            :data-testid="`activity-withdraw-button-${activity.id}`"
            :disabled="signupLoading"
            @click="handleWithdraw"
            class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span v-if="signupLoading">Withdrawing…</span>
            <span v-else>Withdraw</span>
          </button>
          <AddToCalendarButton
            :data-testid="`activity-add-to-calendar-btn-${activity.id}`"
            :uid="`activity-${activity.id}@thuddle.app`"
            :title="activity.title"
            :description="activity.description"
            :location="parentEventLocation"
            :start="activity.startsAt"
            :end="activity.endsAt"
            :filename="`thuddle-activity-${activity.id}.ics`"
          />
        </div>

        <!-- On waitlist → Leave waitlist + position -->
        <div v-else-if="activity.myWaitlistAt" class="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <button
            type="button"
            :data-testid="`activity-waitlist-leave-${activity.id}`"
            :disabled="waitlistLoading"
            @click="handleLeaveWaitlist"
            class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span v-if="waitlistLoading">Leaving waitlist…</span>
            <span v-else>Leave waitlist</span>
          </button>
          <span
            v-if="activity.myWaitlistPosition != null"
            :data-testid="`activity-waitlist-position-${activity.id}`"
            class="text-xs text-gray-500 font-medium"
          >
            Position {{ activity.myWaitlistPosition }}
          </span>
        </div>

        <!-- Activity full, not on waitlist → Join waitlist + Full badge -->
        <div v-else-if="activity.isFull" class="flex items-center gap-2">
          <button
            type="button"
            :data-testid="`activity-waitlist-join-${activity.id}`"
            :disabled="waitlistLoading"
            @click="handleJoinWaitlist"
            class="inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span v-if="waitlistLoading">Joining waitlist…</span>
            <span v-else>Join waitlist</span>
          </button>
          <span
            :data-testid="`activity-full-badge-${activity.id}`"
            class="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200"
          >
            Full
          </span>
        </div>

        <!-- Sign up -->
        <button
          v-else
          type="button"
          :data-testid="`activity-signup-button-${activity.id}`"
          :disabled="signupLoading"
          @click="handleSignup"
          class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span v-if="signupLoading">Signing up…</span>
          <span v-else>Sign up</span>
        </button>
      </div>
    </div>

    <!-- Joined participants disclosure (event participants / admins only) -->
    <div v-if="hasParticipantAccess" class="border-t border-gray-100">
      <button
        type="button"
        :data-testid="`activity-joined-toggle-${activity.id}`"
        class="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        @click="toggleJoined"
      >
        <span>Joined ({{ activity.participantCount ?? 0 }})</span>
        <svg
          class="w-4 h-4 transition-transform duration-200"
          :class="joinedOpen ? 'rotate-180' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <Transition name="slide">
        <div
          v-if="joinedOpen"
          :data-testid="`activity-joined-list-${activity.id}`"
          class="border-t border-gray-100 px-5 pb-4 pt-3 space-y-2"
        >
          <p v-if="!participants.length" class="text-sm text-gray-400">No sign-ups yet.</p>
          <div
            v-for="p in participants"
            :key="p.userId"
            class="flex items-center justify-between gap-2"
          >
            <ParticipantChip
              :user-id="p.userId"
              :display-name="p.displayName"
              :profile-picture-url="p.profilePictureUrl"
              :subline="`Signed up ${formatRelative(p.signedUpAt)}`"
            />
            <button
              v-if="isAdmin"
              type="button"
              :data-testid="isFullWithWaitlist ? `activity-replace-${p.userId}` : `activity-remove-${p.userId}`"
              @click="isFullWithWaitlist ? openReplaceDialog(p) : openRemoveDialog(p)"
              class="shrink-0 text-xs font-medium px-2 py-1 rounded-md border transition-colors"
              :class="isFullWithWaitlist
                ? 'border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                : 'border-red-200 text-red-700 bg-red-50 hover:bg-red-100'"
            >
              {{ isFullWithWaitlist ? 'Replace with…' : 'Remove' }}
            </button>
          </div>
        </div>
      </Transition>

      <template v-if="dialogParticipant">
        <RemoveParticipantDialog
          v-model:open="removeDialogOpen"
          :event-id="eventId"
          :activity-id="activity.id"
          :participant="dialogParticipant"
          :activity-title="activity.title"
        />
        <ReplaceFromWaitlistDialog
          v-model:open="replaceDialogOpen"
          :event-id="eventId"
          :activity-id="activity.id"
          :remove-participant="dialogParticipant"
          :activity-title="activity.title"
          @fall-back-to-remove="onFallBackToRemove"
        />
      </template>
    </div>

    <!-- Waitlist disclosure (event participants / admins only, when waitlist is non-empty) -->
    <div v-if="hasParticipantAccess && (activity.waitlistCount ?? 0) > 0" class="border-t border-gray-100">
      <button
        type="button"
        :data-testid="`activity-waitlist-toggle-${activity.id}`"
        class="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        @click="toggleWaitlist"
      >
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-2 h-2 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
          Waitlist (<span class="text-amber-700">{{ activity.waitlistCount ?? 0 }}</span>)
        </span>
        <svg
          class="w-4 h-4 transition-transform duration-200"
          :class="waitlistOpen ? 'rotate-180' : ''"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <Transition name="slide">
        <div
          v-if="waitlistOpen"
          :data-testid="`activity-waitlist-list-${activity.id}`"
          class="border-t border-gray-100 bg-amber-50/40 px-5 pb-4 pt-3 space-y-2"
        >
          <p v-if="!waitlist.length" class="text-sm text-gray-400">No-one waiting.</p>
          <div
            v-for="(entry, index) in waitlist"
            :key="entry.userId"
            :data-testid="`activity-waitlist-entry-${entry.userId}`"
            class="flex items-center gap-2"
          >
            <span
              :data-testid="`activity-waitlist-position-badge-${entry.userId}`"
              class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold shrink-0"
            >
              {{ index + 1 }}
            </span>
            <ParticipantChip
              :user-id="entry.userId"
              :display-name="entry.displayName"
              :profile-picture-url="entry.profilePictureUrl"
              :subline="`Joined waitlist ${formatRelative(entry.joinedWaitlistAt)}`"
            />
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active { transition: opacity 0.2s ease; }
.slide-enter-from,
.slide-leave-to { opacity: 0; }
</style>
