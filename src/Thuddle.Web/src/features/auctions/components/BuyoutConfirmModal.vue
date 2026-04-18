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
        data-testid="buyout-confirm-modal"
        class="fixed inset-0 z-[55] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="!pending && emit('cancel')" />
        <div class="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <div class="flex items-start gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-100">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-base font-bold text-gray-900">Buy now?</h3>
              <p class="mt-1 text-sm text-gray-600">
                You are buying
                <span class="font-bold text-gray-900">{{ itemName }}</span>
                for
                <span class="font-bold text-amber-700 tabular-nums">{{ formatted }}</span>.
                The auction for this item will end immediately.
              </p>
            </div>
          </div>

          <div
            v-if="errorMessage"
            class="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
          >
            {{ errorMessage }}
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-testid="buyout-confirm-cancel"
              :disabled="pending"
              @click="emit('cancel')"
              class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="buyout-confirm-yes"
              :disabled="pending"
              @click="onConfirm"
              class="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50"
            >
              {{ pending ? 'Buying…' : 'Buy now' }}
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
