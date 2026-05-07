<script setup>
import { computed } from 'vue'
import { useActivitiesStore } from './store'

const props = defineProps({
  eventId: { type: String, required: true },
  activityId: { type: String, required: true }
})

const store = useActivitiesStore()

const participants = computed(() => store.participants.get(props.activityId) ?? [])

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function handleRemove(userId) {
  try {
    await store.removeParticipant(props.eventId, props.activityId, userId)
  } catch { /* best-effort; caller can surface errors if needed */ }
}
</script>

<template>
  <div data-testid="activity-participants-list">
    <!-- Empty state -->
    <p v-if="!participants.length" class="text-sm text-gray-400">
      No sign-ups yet.
    </p>

    <!-- Participant rows -->
    <ul v-else class="space-y-2">
      <li
        v-for="p in participants"
        :key="p.userId"
        :data-testid="`activity-participant-${p.userId}`"
        class="flex items-center justify-between gap-3 py-1.5"
      >
        <div class="flex items-center gap-3 min-w-0">
          <img
            v-if="p.profilePictureUrl"
            :src="p.profilePictureUrl"
            :alt="p.displayName"
            class="w-8 h-8 rounded-full object-cover shrink-0"
          />
          <span
            v-else
            class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0"
          >
            {{ p.displayName?.charAt(0)?.toUpperCase() ?? '?' }}
          </span>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-gray-900 truncate">{{ p.displayName }}</p>
            <p class="text-xs text-gray-400">Signed up {{ formatDate(p.signedUpAt) }}</p>
          </div>
        </div>
        <button
          type="button"
          :data-testid="`activity-remove-participant-${p.userId}`"
          @click="handleRemove(p.userId)"
          class="shrink-0 px-3 py-2 min-h-11 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          Remove
        </button>
      </li>
    </ul>
  </div>
</template>
