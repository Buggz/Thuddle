<script setup>
import { ref, computed } from 'vue'
import { useEventFeaturesStore } from '@/features/events/stores/eventFeatures'
import { EVENT_FEATURES, FeatureKeys } from '@/features/events/featureCatalog'
import { useFeatureFlags } from '@/shared/featureFlags'

const props = defineProps({
  eventId: { type: String, required: true },
  isOpen: { type: Boolean, required: true }
})

const emit = defineEmits(['update:isOpen'])

const featuresStore = useEventFeaturesStore()
const { auctions: auctionsEnabled } = useFeatureFlags()

const adding = ref(new Set())
const addErrors = ref(new Map())

const availableFeatures = computed(() => {
  const enabledSet = featuresStore.enabledByEvent.get(props.eventId) ?? new Set()
  return EVENT_FEATURES.filter((meta) => {
    if (enabledSet.has(meta.key)) return false
    if (meta.key === FeatureKeys.Auction && !auctionsEnabled.value) return false
    return true
  })
})

function close() {
  emit('update:isOpen', false)
}

async function addFeature(key) {
  if (adding.value.has(key)) return
  clearError(key)

  const next = new Set(adding.value)
  next.add(key)
  adding.value = next

  try {
    await featuresStore.enableFeature(props.eventId, key)
    close()
  } catch (err) {
    setError(key, err.message || 'Failed to add feature.')
  } finally {
    const after = new Set(adding.value)
    after.delete(key)
    adding.value = after
  }
}

function setError(key, message) {
  const next = new Map(addErrors.value)
  next.set(key, message)
  addErrors.value = next
}

function clearError(key) {
  if (!addErrors.value.has(key)) return
  const next = new Map(addErrors.value)
  next.delete(key)
  addErrors.value = next
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4"
        data-testid="feature-picker-modal"
      >
        <!-- Backdrop — clickable on desktop; on mobile the panel is full-screen -->
        <div class="absolute inset-0 bg-black/40 hidden sm:block" @click="close" />

        <!-- Modal panel: full-screen on mobile, centred card on desktop -->
        <div
          class="relative bg-white flex flex-col w-full flex-1 overflow-hidden
                 sm:flex-none sm:max-w-xl sm:rounded-xl sm:shadow-xl sm:max-h-[80vh]"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 class="text-lg font-bold text-gray-900">Add a feature</h2>
            <button
              data-testid="feature-picker-close"
              type="button"
              @click="close"
              class="w-11 h-11 flex items-center justify-center rounded-lg
                     text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <!-- All enabled -->
            <div
              v-if="availableFeatures.length === 0"
              data-testid="feature-picker-empty"
              class="flex flex-col items-center justify-center py-12 text-center"
            >
              <span class="text-4xl mb-3" aria-hidden="true">✅</span>
              <p class="text-sm font-semibold text-gray-700">All features are already enabled.</p>
              <p class="text-xs text-gray-500 mt-1">There are no more features to add to this event.</p>
            </div>

            <!-- Feature cards -->
            <div
              v-for="meta in availableFeatures"
              :key="meta.key"
              :data-testid="`feature-picker-card-${meta.key}`"
              class="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-xl"
            >
              <span class="text-2xl shrink-0 mt-0.5" aria-hidden="true">{{ meta.icon }}</span>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-bold text-gray-900">{{ meta.label }}</h3>
                <p class="text-xs text-gray-500 mt-1 leading-relaxed">{{ meta.description }}</p>
                <p
                  v-if="addErrors.get(meta.key)"
                  class="mt-2 text-sm text-red-600"
                >
                  {{ addErrors.get(meta.key) }}
                </p>
              </div>
              <button
                :data-testid="`feature-picker-add-${meta.key}`"
                type="button"
                @click="addFeature(meta.key)"
                :disabled="adding.has(meta.key)"
                class="shrink-0 min-h-11 px-3 py-2 text-sm font-semibold rounded-lg
                       bg-indigo-600 text-white hover:bg-indigo-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors sm:min-h-0 sm:py-1.5"
              >
                {{ adding.has(meta.key) ? 'Adding…' : 'Add' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
