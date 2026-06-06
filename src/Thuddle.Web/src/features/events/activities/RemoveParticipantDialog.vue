<script setup>
import { ref } from 'vue'
import { useActivitiesStore } from './store'

const props = defineProps({
  open: { type: Boolean, required: true },
  eventId: { type: String, required: true },
  activityId: { type: String, required: true },
  participant: { type: Object, required: true },
  activityTitle: { type: String, required: true }
})

const emit = defineEmits(['update:open', 'removed'])

const store = useActivitiesStore()
const loading = ref(false)
const error = ref(null)

async function handleRemove() {
  loading.value = true
  error.value = null
  try {
    await store.removeParticipant(props.eventId, props.activityId, props.participant.userId)
    emit('removed')
    emit('update:open', false)
  } catch (err) {
    error.value = err.message || 'Failed to remove participant.'
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        data-testid="remove-participant-dialog"
      >
        <div class="absolute inset-0 bg-black/40" @click="handleCancel" />
        <div class="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
          <div class="flex items-start gap-3">
            <div class="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
              <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-gray-900">Remove participant?</h3>
              <p class="mt-1 text-sm text-gray-600">
                Remove <strong>{{ participant.displayName }}</strong> from <strong>{{ activityTitle }}</strong>?
              </p>
              <p
                v-if="error"
                data-testid="remove-participant-error"
                class="mt-2 text-sm text-red-600"
              >
                {{ error }}
              </p>
            </div>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-testid="remove-participant-cancel"
              :disabled="loading"
              @click="handleCancel"
              class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="remove-participant-confirm"
              :disabled="loading"
              @click="handleRemove"
              class="px-3 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span v-if="loading">Removing…</span>
              <span v-else>Remove</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
