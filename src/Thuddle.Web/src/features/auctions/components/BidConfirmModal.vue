<script setup>
import { computed } from 'vue'
import { formatCurrency } from '@/shared/formatCurrency'

const props = defineProps({
  open: { type: Boolean, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: '' },
  itemName: { type: String, default: '' },
  pending: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' }
})

const emit = defineEmits(['confirmed', 'cancel'])

const formatted = computed(() => formatCurrency(props.amount, props.currency))

function onConfirm() {
  if (props.pending) return
  emit('confirmed', props.amount)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bid-modal">
      <div
        v-if="open"
        data-testid="bid-confirm-modal"
        class="fixed inset-0 z-[55] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="!pending && emit('cancel')" />
        <div class="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8V6m0 12v-2m0-12C7.582 4 4 5.79 4 8s3.582 4 8 4 8 1.79 8 4-3.582 4-8 4" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-base font-bold text-gray-900">Confirm bid</h3>
              <p class="mt-1 text-sm text-gray-600">
                You are bidding
                <span data-testid="bid-confirm-amount" class="font-bold text-indigo-700 tabular-nums">{{ formatted }}</span>
                on
                <span class="font-bold text-gray-900">{{ itemName }}</span>.
              </p>
              <p class="mt-1 text-xs text-gray-400">Bids cannot be retracted. Order and method, please.</p>
            </div>
          </div>

          <div
            v-if="errorMessage"
            data-testid="bid-error-message"
            class="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
          >
            {{ errorMessage }}
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-testid="bid-confirm-cancel"
              :disabled="pending"
              @click="emit('cancel')"
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="bid-confirm-yes"
              :disabled="pending"
              @click="onConfirm"
              class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {{ pending ? 'Placing…' : 'Confirm bid' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bid-modal-enter-active, .bid-modal-leave-active { transition: opacity 0.15s ease; }
.bid-modal-enter-from, .bid-modal-leave-to { opacity: 0; }
</style>
