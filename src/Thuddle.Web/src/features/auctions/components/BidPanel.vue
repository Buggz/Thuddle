<script setup>
import { ref, computed, watch } from 'vue'
import { formatCurrency, parseDecimalInput } from '@/shared/formatCurrency'
import BidConfirmModal from './BidConfirmModal.vue'
import BuyoutConfirmModal from './BuyoutConfirmModal.vue'

const props = defineProps({
  item: { type: Object, required: true },
  currency: { type: String, default: '' },
  minBidIncrement: { type: Number, default: 1 },
  allowBuyout: { type: Boolean, default: false },
  isLive: { type: Boolean, default: true },
  canBid: { type: Boolean, default: true },
  pending: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' }
})

const emit = defineEmits(['place-bid', 'buy-out'])

const minBid = computed(() => {
  const current = props.item.currentBid
  const start = props.item.startingBid
  if (current == null) return Number(start) || 0
  return Number(current) + Number(props.minBidIncrement || 0)
})

const amountRaw = ref('')
const bidConfirmOpen = ref(false)
const buyoutConfirmOpen = ref(false)
const lastIdempotencyKey = ref('')

watch(minBid, (val) => {
  if (!amountRaw.value || Number(amountRaw.value) < val) {
    amountRaw.value = String(val)
  }
}, { immediate: true })

// Auto-close the modal when the parent finishes the call without an error.
watch(() => props.pending, (now, was) => {
  if (was && !now && !props.errorMessage) {
    bidConfirmOpen.value = false
    buyoutConfirmOpen.value = false
  }
})

const parsedAmount = computed(() => parseDecimalInput(amountRaw.value))
const amountValid = computed(() =>
  parsedAmount.value !== null && parsedAmount.value >= minBid.value
)

function genIdempotencyKey() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function openBidConfirm() {
  if (!amountValid.value) return
  lastIdempotencyKey.value = genIdempotencyKey()
  bidConfirmOpen.value = true
}

function openBuyoutConfirm() {
  if (!props.item.buyoutPrice) return
  lastIdempotencyKey.value = genIdempotencyKey()
  buyoutConfirmOpen.value = true
}

function onConfirmBid() {
  emit('place-bid', { amount: parsedAmount.value, idempotencyKey: lastIdempotencyKey.value })
}

function onConfirmBuyout() {
  emit('buy-out', { idempotencyKey: lastIdempotencyKey.value })
}
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div v-if="!isLive" class="text-sm text-gray-500">
      Bidding opens when the auction goes live.
    </div>
    <template v-else>
      <label class="block text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
        Your bid
      </label>
      <div class="flex items-stretch gap-2">
        <div class="relative flex-1">
          <input
            v-model="amountRaw"
            data-testid="bid-amount-input"
            type="text"
            inputmode="decimal"
            :disabled="!canBid"
            class="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg font-bold text-gray-900 tabular-nums focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
            :placeholder="String(minBid)"
            @keydown.enter.prevent="openBidConfirm"
          />
          <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-gray-400">
            {{ currency }}
          </span>
        </div>
        <button
          type="button"
          data-testid="bid-place-btn"
          :disabled="!canBid || !amountValid"
          @click="openBidConfirm"
          class="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Place bid
        </button>
      </div>
      <p class="mt-2 text-xs text-gray-500">
        Minimum next bid: <span class="font-semibold text-gray-700 tabular-nums">{{ formatCurrency(minBid, currency) }}</span>
      </p>
      <p
        v-if="!amountValid && amountRaw"
        data-testid="bid-error-message"
        class="mt-1 text-xs font-semibold text-red-600"
      >
        Must be at least {{ formatCurrency(minBid, currency) }}.
      </p>
      <p
        v-if="errorMessage && !bidConfirmOpen && !buyoutConfirmOpen"
        data-testid="bid-error-message"
        class="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"
      >
        {{ errorMessage }}
      </p>

      <div v-if="allowBuyout && item.buyoutPrice" class="mt-4 border-t border-gray-100 pt-4">
        <button
          type="button"
          data-testid="buyout-btn"
          :disabled="!canBid"
          @click="openBuyoutConfirm"
          class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Buy now for {{ formatCurrency(item.buyoutPrice, currency) }}
        </button>
      </div>
    </template>

    <BidConfirmModal
      :open="bidConfirmOpen"
      :amount="parsedAmount || 0"
      :currency="currency"
      :item-name="item.name"
      :pending="pending"
      :error-message="errorMessage"
      @confirmed="onConfirmBid"
      @cancel="bidConfirmOpen = false"
    />
    <BuyoutConfirmModal
      :open="buyoutConfirmOpen"
      :amount="item.buyoutPrice || 0"
      :currency="currency"
      :item-name="item.name"
      :pending="pending"
      :error-message="errorMessage"
      @confirmed="onConfirmBuyout"
      @cancel="buyoutConfirmOpen = false"
    />
  </div>
</template>
