<script setup>
defineProps({
  isOpen: Boolean,
  submitting: Boolean
})

const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        data-testid="unpublish-dialog"
        class="fixed inset-0 z-[55] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="!submitting && emit('cancel')" />
        <div class="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <h3 class="text-base font-bold text-gray-900">Unpublish this item?</h3>
              <p class="mt-2 text-sm text-gray-600">
                Pulling back to draft will hide your item from the auction. You'll need to publish again before it can be seen by bidders.
              </p>
            </div>
          </div>
          
          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              data-testid="unpublish-dialog-cancel"
              @click="emit('cancel')"
              :disabled="submitting"
              class="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 sm:w-auto transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Keep published
            </button>
            <button
              data-testid="unpublish-dialog-confirm"
              @click="emit('confirm')"
              :disabled="submitting"
              class="inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 sm:w-auto disabled:opacity-50 transition-colors"
            >
              {{ submitting ? 'Unpublishing…' : 'Unpublish to draft' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>