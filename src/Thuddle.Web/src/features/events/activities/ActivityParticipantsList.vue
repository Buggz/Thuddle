<script setup>
import { computed, ref } from 'vue'
import { useActivitiesStore } from './store'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import ParticipantChip from '@/shared/components/ParticipantChip.vue'

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

const pendingRemoval = ref(null)
const removeDialogOpen = ref(false)

function confirmRemove(userId, displayName) {
  pendingRemoval.value = { userId, displayName }
  removeDialogOpen.value = true
}

function cancelRemove() {
  removeDialogOpen.value = false
  pendingRemoval.value = null
}

async function executeRemove() {
  const { userId } = pendingRemoval.value
  removeDialogOpen.value = false
  pendingRemoval.value = null
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
        <ParticipantChip
          :user-id="p.userId"
          :display-name="p.displayName"
          :profile-picture-url="p.profilePictureUrl"
          :subline="`Signed up ${formatDate(p.signedUpAt)}`"
        />
        <button
          type="button"
          :data-testid="`activity-remove-participant-${p.userId}`"
          @click="confirmRemove(p.userId, p.displayName)"
          class="shrink-0 px-3 py-2 min-h-11 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          Remove
        </button>
      </li>
    </ul>

    <ConfirmDialog
      :open="removeDialogOpen"
      title="Remove participant"
      :message="pendingRemoval ? `Remove ${pendingRemoval.displayName} from this activity? They will be notified.` : ''"
      confirm-label="Remove"
      @confirm="executeRemove"
      @cancel="cancelRemove"
    />
  </div>
</template>
