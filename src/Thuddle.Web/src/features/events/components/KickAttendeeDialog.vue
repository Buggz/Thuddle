<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, required: true },
  attendeeName: { type: String, default: '' },
  attendeeHasInvitation: { type: Boolean, default: false }
})

const emit = defineEmits(['confirm', 'cancel'])

const revokeInvitation = ref(false)

// Reset checkbox each time the dialog opens
watch(() => props.open, (isOpen) => {
  if (isOpen) revokeInvitation.value = false
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center" data-testid="kick-dialog">
        <div class="absolute inset-0 bg-black/40" @click="emit('cancel')" />
        <div class="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
          <div class="flex items-start gap-3">
            <div class="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
              <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-gray-900">Remove attendee?</h3>
              <p class="mt-1 text-sm text-gray-600">
                Remove <span class="font-semibold">{{ attendeeName }}</span> from this event?
              </p>
            </div>
          </div>

          <label v-if="attendeeHasInvitation" class="mt-4 flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              v-model="revokeInvitation"
              data-testid="kick-revoke-invitation-checkbox"
              class="mt-0.5"
            />
            <span>
              Also revoke their invitation
              <span class="block text-xs text-gray-500">If unchecked, they can rejoin using their existing invitation.</span>
            </span>
          </label>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-testid="kick-cancel-btn"
              @click="emit('cancel')"
              class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="kick-confirm-btn"
              @click="emit('confirm', { revokeInvitation })"
              class="px-3 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
            >
              Remove
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
