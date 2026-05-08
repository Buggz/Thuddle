<script setup>
import { ref, computed, onMounted } from 'vue'
import { useActivitiesStore } from './store'
import ActivityEditor from './ActivityEditor.vue'
import ActivityParticipantsList from './ActivityParticipantsList.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

const props = defineProps({
  eventId: { type: String, required: true }
})

const store = useActivitiesStore()

const loading = ref(false)
const error = ref(null)
const editorOpen = ref(false)
const editingActivity = ref(null) // null = create
const saving = ref(false)
const saveError = ref(null)
const expandedActivityId = ref(null)
const deleteDialogOpen = ref(false)
const pendingDeleteId = ref(null)

const activities = computed(() => store.activitiesFor(props.eventId))

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

async function loadActivities() {
  loading.value = true
  error.value = null
  try {
    await store.fetchActivities(props.eventId)
  } catch (err) {
    error.value = err.message || 'Failed to load activities.'
  } finally {
    loading.value = false
  }
}

async function toggleExpand(activityId) {
  if (expandedActivityId.value === activityId) {
    expandedActivityId.value = null
    return
  }
  expandedActivityId.value = activityId
  try {
    await store.fetchActivity(props.eventId, activityId)
  } catch { /* best-effort */ }
}

function openCreate() {
  editingActivity.value = null
  saveError.value = null
  editorOpen.value = true
}

function openEdit(activity, e) {
  e?.stopPropagation()
  editingActivity.value = activity
  saveError.value = null
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingActivity.value = null
  saveError.value = null
}

async function handleSave(body) {
  saving.value = true
  saveError.value = null
  try {
    if (editingActivity.value) {
      await store.updateActivity(props.eventId, editingActivity.value.id, body)
    } else {
      await store.createActivity(props.eventId, body)
    }
    closeEditor()
    // Refresh list — SignalR fires too, but let's not rely solely on it
    await store.fetchActivities(props.eventId)
  } catch (err) {
    saveError.value = err.message || 'Failed to save activity.'
  } finally {
    saving.value = false
  }
}

function confirmDelete(activityId, e) {
  e?.stopPropagation()
  pendingDeleteId.value = activityId
  deleteDialogOpen.value = true
}

async function executeDelete() {
  const id = pendingDeleteId.value
  deleteDialogOpen.value = false
  pendingDeleteId.value = null
  try {
    await store.deleteActivity(props.eventId, id)
    if (expandedActivityId.value === id) expandedActivityId.value = null
    await store.fetchActivities(props.eventId)
  } catch (err) {
    error.value = err.message || 'Failed to delete activity.'
  }
}

onMounted(() => {
  loadActivities()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Section header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <h3 class="text-base font-bold text-gray-900">Activities</h3>
      <button
        type="button"
        data-testid="activity-create-button"
        @click="openCreate"
        class="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11
               text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200
               rounded-lg hover:bg-indigo-100 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Activity
      </button>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 flex justify-center">
      <div class="text-sm text-gray-400 animate-pulse">Loading activities…</div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!activities.length"
      data-testid="activities-empty"
      class="text-center py-12 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50"
    >
      <div class="text-3xl mb-3" aria-hidden="true">📋</div>
      <p class="text-sm font-semibold text-gray-700">No activities yet</p>
      <p class="text-xs text-gray-400 mt-1">Click "Add Activity" to create the first one.</p>
    </div>

    <!-- Activity cards -->
    <div v-else data-testid="activities-list" class="space-y-3">
      <div
        v-for="activity in activities"
        :key="activity.id"
        :data-testid="`activity-card-${activity.id}`"
        class="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      >
        <!-- Card header: info + action buttons -->
        <div class="flex items-start gap-3 px-5 py-4">
          <div class="flex-1 min-w-0 space-y-1.5">
            <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-2">
              <p data-testid="activity-card-title" class="text-sm font-bold text-gray-900">{{ activity.title }}</p>
              <span
                data-testid="activity-card-time"
                class="text-xs text-gray-400 font-medium sm:shrink-0"
              >
                {{ formatActivityTime(activity.startsAt, activity.endsAt) }}
              </span>
            </div>
            <div
              v-if="activity.maxParticipants"
              data-testid="activity-card-capacity"
              class="space-y-1"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400">
                  {{ activity.participantCount }} / {{ activity.maxParticipants }} signed up
                </span>
                <span
                  v-if="activity.isFull"
                  :data-testid="`activity-full-badge-${activity.id}`"
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200"
                >
                  Full
                </span>
              </div>
              <div
                role="progressbar"
                :aria-valuenow="activity.participantCount"
                :aria-valuemin="0"
                :aria-valuemax="activity.maxParticipants"
                :aria-label="`${activity.participantCount} of ${activity.maxParticipants} signed up`"
                class="h-1.5 rounded-full bg-gray-100 overflow-hidden"
              >
                <div
                  class="h-full rounded-full bg-indigo-400 transition-all duration-300"
                  :style="{ width: `${Math.min(100, (activity.participantCount / activity.maxParticipants) * 100)}%` }"
                />
              </div>
            </div>
            <div
              v-else
              data-testid="activity-manage-capacity-unlimited"
              class="text-xs text-gray-400"
            >
              ∞ Unlimited
            </div>
          </div>

          <!-- Edit / Delete buttons -->
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              :data-testid="`activity-edit-button-${activity.id}`"
              class="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg
                     text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Edit activity"
              @click="openEdit(activity, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
              </svg>
            </button>
            <button
              type="button"
              :data-testid="`activity-delete-button-${activity.id}`"
              class="p-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg
                     text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete activity"
              @click="confirmDelete(activity.id, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Participants disclosure toggle -->
        <div class="border-t border-gray-100">
          <button
            type="button"
            class="w-full flex items-center justify-between px-5 py-3
                   text-xs font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            @click="toggleExpand(activity.id)"
          >
            <span>
              {{ activity.participantCount ?? 0 }}
              participant{{ (activity.participantCount ?? 0) === 1 ? '' : 's' }}
            </span>
            <svg
              class="w-4 h-4 transition-transform duration-200"
              :class="expandedActivityId === activity.id ? 'rotate-180' : ''"
              fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          <Transition name="slide">
            <div
              v-if="expandedActivityId === activity.id"
              class="border-t border-gray-100 px-5 py-4"
            >
              <ActivityParticipantsList
                :event-id="eventId"
                :activity-id="activity.id"
              />
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Activity editor modal -->
    <ActivityEditor
      v-model:is-open="editorOpen"
      :event-id="eventId"
      :activity="editingActivity"
      :saving="saving"
      :save-error="saveError"
      @save="handleSave"
    />

    <!-- Delete confirmation dialog -->
    <ConfirmDialog
      :open="deleteDialogOpen"
      title="Delete activity"
      message="This will permanently delete the activity and all sign-ups. This action cannot be undone."
      confirm-label="Delete"
      @confirm="executeDelete"
      @cancel="deleteDialogOpen = false"
    />
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active { transition: opacity 0.2s ease; }
.slide-enter-from,
.slide-leave-to { opacity: 0; }
</style>
