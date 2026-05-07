<script setup>
import { ref, computed } from 'vue'
import { useEventFeaturesStore } from '@/features/events/stores/eventFeatures'
import { EVENT_FEATURES, getFeatureMeta } from '@/features/events/featureCatalog'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import FeaturePickerModal from '@/features/events/components/FeaturePickerModal.vue'

const props = defineProps({
  eventId: { type: String, required: true }
})

const featuresStore = useEventFeaturesStore()

const pickerOpen = ref(false)
const confirmKey = ref(null)
const removing = ref(false)
const errors = ref(new Map())

const enabledMetas = computed(() => {
  const enabledSet = featuresStore.enabledByEvent.get(props.eventId) ?? new Set()
  return EVENT_FEATURES.filter((meta) => enabledSet.has(meta.key))
})

function requestRemove(key) {
  clearError(key)
  confirmKey.value = key
}

async function doRemove() {
  const key = confirmKey.value
  if (!key) return
  confirmKey.value = null
  removing.value = true
  clearError(key)
  try {
    await featuresStore.disableFeature(props.eventId, key)
  } catch (err) {
    setError(key, err.message || 'Failed to remove feature.')
  } finally {
    removing.value = false
  }
}

function setError(key, message) {
  const next = new Map(errors.value)
  next.set(key, message)
  errors.value = next
}

function clearError(key) {
  if (!errors.value.has(key)) return
  const next = new Map(errors.value)
  next.delete(key)
  errors.value = next
}
</script>

<template>
  <div data-testid="event-features-manager">
    <div data-testid="event-features-list" class="space-y-3 mb-6">
      <template v-for="meta in enabledMetas" :key="meta.key">
        <!-- Feature chip card -->
        <div
          :data-testid="`event-feature-chip-${meta.key}`"
          class="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl shadow-sm"
        >
          <span class="text-2xl shrink-0" aria-hidden="true">{{ meta.icon }}</span>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-bold text-gray-900">{{ meta.label }}</h3>
            <p class="text-xs text-gray-500 mt-0.5 leading-relaxed">{{ meta.description }}</p>
          </div>
          <button
            :data-testid="`event-feature-remove-${meta.key}`"
            type="button"
            @click="requestRemove(meta.key)"
            class="shrink-0 min-h-11 px-3 py-2 text-sm font-medium text-red-600
                   border border-red-200 rounded-lg hover:bg-red-50 transition-colors
                   sm:min-h-0 sm:py-1.5"
          >
            Remove
          </button>
        </div>

        <!-- Inline remove error -->
        <div
          v-if="errors.get(meta.key)"
          :data-testid="`event-feature-remove-error-${meta.key}`"
          class="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg"
        >
          <p class="flex-1 text-sm text-red-700">{{ errors.get(meta.key) }}</p>
          <button
            type="button"
            @click="clearError(meta.key)"
            class="shrink-0 text-red-400 hover:text-red-600 transition-colors text-lg leading-none"
            aria-label="Dismiss error"
          >×</button>
        </div>
      </template>
    </div>

    <!-- Empty state -->
    <p
      v-if="enabledMetas.length === 0"
      data-testid="event-features-empty"
      class="text-sm text-gray-500 mb-6"
    >
      No features enabled yet. Add a feature below to unlock additional functionality for this event.
    </p>

    <!-- Add a feature button -->
    <button
      data-testid="event-feature-add-btn"
      type="button"
      @click="pickerOpen = true"
      class="w-full sm:w-auto min-h-11 flex items-center justify-center gap-2
             px-4 py-2.5 text-sm font-semibold rounded-xl
             bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Add a feature
    </button>

    <!-- Confirm remove dialog -->
    <ConfirmDialog
      :open="!!confirmKey"
      title="Remove feature?"
      :message="confirmKey ? `Remove ${getFeatureMeta(confirmKey)?.label ?? confirmKey} from this event? Existing content created by this feature will not be deleted.` : ''"
      confirm-label="Remove"
      variant="danger"
      @confirm="doRemove"
      @cancel="confirmKey = null"
    />

    <!-- Feature picker modal -->
    <FeaturePickerModal
      :event-id="eventId"
      v-model:is-open="pickerOpen"
    />
  </div>
</template>
