<script setup>
import { computed } from 'vue'
import { formatCurrency } from '@/shared/formatCurrency'

const props = defineProps({
  bids: { type: Array, default: () => [] },
  currency: { type: String, default: '' }
})

const sorted = computed(() =>
  [...props.bids].sort((a, b) => Number(b.amount) - Number(a.amount))
)

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <h3 class="text-[11px] font-bold uppercase tracking-widest text-gray-500">
        Bid history
      </h3>
      <span class="text-xs font-bold text-gray-400">{{ sorted.length }} bids</span>
    </div>
    <ul v-if="sorted.length" data-testid="bid-history-list" class="divide-y divide-gray-100">
      <li
        v-for="(bid, idx) in sorted"
        :key="bid.id || idx"
        :data-testid="`bid-history-row-${idx}`"
        class="flex items-center justify-between px-4 py-2.5 text-sm"
        :class="idx === 0 ? 'bg-indigo-50/40' : ''"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 text-indigo-600 flex items-center justify-center text-[11px] font-bold"
          >
            {{ (bid.bidderName || '?').charAt(0).toUpperCase() }}
          </span>
          <div class="min-w-0">
            <p class="font-semibold text-gray-900 truncate">{{ bid.bidderName || 'Bidder' }}</p>
            <p class="text-[11px] text-gray-400">{{ formatTime(bid.createdAt) }}</p>
          </div>
        </div>
        <div class="text-right">
          <p class="font-extrabold text-gray-900 tabular-nums">{{ formatCurrency(bid.amount, currency) }}</p>
          <p v-if="bid.isBuyout" class="text-[10px] font-bold uppercase tracking-widest text-amber-600">Buyout</p>
        </div>
      </li>
    </ul>
    <div v-else class="px-4 py-8 text-center text-sm text-gray-400">
      No bids yet. Be the first.
    </div>
  </div>
</template>
