<script setup>
defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, default: 'Confirm' },
  message: { type: String, default: 'Are you sure?' },
  confirmLabel: { type: String, default: 'Delete' },
  cancelLabel: { type: String, default: 'Cancel' },
  variant: { type: String, default: 'danger' }
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="emit('cancel')" />

        <!-- Dialog -->
        <div class="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 animate-in">
          <div class="flex items-start gap-3">
            <!-- Warning icon -->
            <div class="shrink-0 flex items-center justify-center w-10 h-10 rounded-full"
              :class="variant === 'danger' ? 'bg-red-100' : 'bg-amber-100'">
              <svg class="w-5 h-5" :class="variant === 'danger' ? 'text-red-600' : 'text-amber-600'"
                fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold text-gray-900">{{ title }}</h3>
              <p class="mt-1 text-sm text-gray-600">{{ message }}</p>
            </div>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-testid="confirm-dialog-cancel"
              @click="emit('cancel')"
              class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              data-testid="confirm-dialog-confirm"
              @click="emit('confirm')"
              class="px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition-colors"
              :class="variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'"
            >
              {{ confirmLabel }}
            </button>
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
.animate-in {
  animation: dialog-in 0.15s ease-out;
}
@keyframes dialog-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
