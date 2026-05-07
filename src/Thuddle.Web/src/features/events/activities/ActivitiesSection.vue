<script setup>
import { ref, computed, onMounted } from 'vue'
import { useActivitiesStore } from './store'
import { useRealtime } from '@/shared/composables/useRealtime'
import ActivityCard from './ActivityCard.vue'

const props = defineProps({
  eventId: { type: String, required: true }
})

const store = useActivitiesStore()
const realtime = useRealtime()
const loading = ref(false)
const error = ref(null)

const activities = computed(() => store.activitiesFor(props.eventId))

async function loadActivities() {
  loading.value = true
  error.value = null
  try {
    // Ensure the event:{eventId} SignalR group subscription is established
    // before fetching so realtime updates (ActivityParticipantChanged etc.)
    // arrive from the moment the section is visible.
    await realtime.subscribeEvents([props.eventId]).catch(() => {})
    await store.fetchActivities(props.eventId)
  } catch (err) {
    error.value = err.message || 'Failed to load activities.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadActivities()
})
</script>

<template>
  <div data-testid="activities-section" class="space-y-4">
    <!-- Section header -->
    <h3 class="text-base font-bold text-gray-900">Activities</h3>

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
      <p class="text-sm font-semibold text-gray-700">No activities scheduled yet.</p>
    </div>

    <!-- Activity list -->
    <div v-else data-testid="activities-list" class="space-y-3">
      <ActivityCard
        v-for="activity in activities"
        :key="activity.id"
        :activity="activity"
        :event-id="eventId"
      />
    </div>
  </div>
</template>
