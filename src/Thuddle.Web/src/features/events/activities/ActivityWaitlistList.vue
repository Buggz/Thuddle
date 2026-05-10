<script setup>
import { ref, computed } from 'vue'
import { useActivitiesStore } from './store'
import ParticipantChip from '@/shared/components/ParticipantChip.vue'
import ActivityFullPromoteDialog from './ActivityFullPromoteDialog.vue'

const props = defineProps({
  eventId: { type: String, required: true },
  activityId: { type: String, required: true }
})

const store = useActivitiesStore()

const activity = computed(() => store.activities.get(props.activityId))

const waitlist = computed(() => {
  const list = store.waitlistByActivity.get(props.activityId) ?? []
  return [...list].sort((a, b) => new Date(a.joinedWaitlistAt) - new Date(b.joinedWaitlistAt))
})

const promoteError = ref(null)
const promoteDialogOpen = ref(false)
const pendingPromotion = ref(null) // { userId, displayName }

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

async function handlePromote(entry) {
  promoteError.value = null
  try {
    await store.promoteFromWaitlist(props.eventId, props.activityId, entry.userId, { allowOverflow: false })
  } catch (err) {
    if (err.code === 'activity_full') {
      pendingPromotion.value = entry
      promoteDialogOpen.value = true
    } else {
      promoteError.value = err.message || 'Failed to promote participant.'
    }
  }
}

async function handleForcePromote() {
  if (!pendingPromotion.value) return
  promoteError.value = null
  const entry = pendingPromotion.value
  promoteDialogOpen.value = false
  pendingPromotion.value = null
  try {
    await store.promoteFromWaitlist(props.eventId, props.activityId, entry.userId, { allowOverflow: true })
  } catch (err) {
    promoteError.value = err.message || 'Failed to promote participant.'
  }
}

function cancelPromote() {
  promoteDialogOpen.value = false
  pendingPromotion.value = null
}
</script>

<template>
  <div data-testid="activity-waitlist-list">
    <p v-if="!waitlist.length" class="text-sm text-gray-400">No one on the waitlist.</p>

    <p v-if="promoteError" class="mb-2 text-xs text-red-600">{{ promoteError }}</p>

    <ul v-if="waitlist.length" class="space-y-2">
      <li
        v-for="entry in waitlist"
        :key="entry.userId"
        :data-testid="`activity-waitlist-entry-${entry.userId}`"
        class="flex items-center justify-between gap-3 py-1.5"
      >
        <ParticipantChip
          :user-id="entry.userId"
          :display-name="entry.displayName"
          :profile-picture-url="entry.profilePictureUrl"
          :subline="`Joined waitlist ${formatDate(entry.joinedWaitlistAt)}`"
        />
        <button
          type="button"
          :data-testid="`activity-waitlist-promote-${entry.userId}`"
          @click="handlePromote(entry)"
          class="shrink-0 px-3 py-2 min-h-11 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          Move into activity
        </button>
      </li>
    </ul>

    <ActivityFullPromoteDialog
      :open="promoteDialogOpen"
      :entry="pendingPromotion"
      :max-participants="activity?.maxParticipants"
      @confirm="handleForcePromote"
      @cancel="cancelPromote"
    />
  </div>
</template>
