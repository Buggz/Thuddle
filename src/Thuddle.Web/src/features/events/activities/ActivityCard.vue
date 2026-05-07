<script setup>
import { ref } from 'vue'
import { useActivitiesStore } from './store'

const props = defineProps({
  activity: { type: Object, required: true },
  eventId: { type: String, required: true }
})

const store = useActivitiesStore()
const signupError = ref(null)
const signupLoading = ref(false)

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
</script>

<template>
  <div
    :data-testid="`activity-card-${activity.id}`"
    class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
  >
    <div class="px-5 py-4 space-y-3">
      <!-- Header row: title + time -->
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3">
        <h4
          data-testid="activity-card-title"
          class="text-sm font-bold text-gray-900 leading-snug"
        >
          {{ activity.title }}
        </h4>
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

      <!-- Description preview (truncated) -->
      <div
        v-if="activity.description"
        class="text-sm text-gray-600 line-clamp-3 prose prose-sm max-w-none"
        v-html="activity.description"
      />

      <!-- Footer: action buttons -->
      <div class="pt-1">
        <!-- Inline error -->
        <p v-if="signupError" class="mb-2 text-xs text-red-600">
          {{ signupError }}
        </p>

        <!-- Already signed up → Withdraw -->
        <button
          v-if="activity.mySignupAt"
          type="button"
          :data-testid="`activity-withdraw-button-${activity.id}`"
          :disabled="signupLoading"
          @click="handleWithdraw"
          class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span v-if="signupLoading">Withdrawing…</span>
          <span v-else>Withdraw</span>
        </button>

        <!-- Activity full → disabled button + badge -->
        <div v-else-if="activity.isFull" class="flex items-center gap-2">
          <button
            type="button"
            disabled
            class="inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold rounded-lg bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
          >
            Full
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
  </div>
</template>
