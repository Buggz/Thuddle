<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { formatCurrency } from '@/shared/formatCurrency'

const props = defineProps({
  item: { type: Object, required: true },
  currency: { type: String, default: '' },
  eventId: { type: String, required: true }
})

const thumbnail = computed(() => props.item.imageUrls?.[0] || props.item.games?.[0]?.imageUrl || null)
const currentBidLabel = computed(() => {
  const amt = props.item.currentBid ?? props.item.startingBid
  return formatCurrency(amt, props.currency)
})

const statusBadge = computed(() => {
  switch (props.item.status) {
    case 'Sold':
      return { label: 'Sold', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' }
    case 'Unsold':
      return { label: 'Unsold', cls: 'bg-gray-100 text-gray-600 ring-gray-200' }
    case 'PendingApproval':
      return { label: 'Pending', cls: 'bg-amber-50 text-amber-700 ring-amber-200' }
    case 'Withdrawn':
      return { label: 'Withdrawn', cls: 'bg-gray-100 text-gray-500 ring-gray-200' }
    case 'Live':
      return { label: 'Live', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' }
    default:
      return { label: props.item.status, cls: 'bg-gray-100 text-gray-600 ring-gray-200' }
  }
})
</script>

<template>
  <RouterLink
    :data-testid="`auction-item-card-${item.id}`"
    :to="{ name: 'auction-item', params: { id: eventId, itemId: item.id } }"
    class="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
  >
    <div class="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-indigo-50 to-purple-50">
      <img
        v-if="thumbnail"
        :src="thumbnail"
        :alt="item.name"
        class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div v-else class="absolute inset-0 flex items-center justify-center text-indigo-300">
        <svg class="w-12 h-12" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
        </svg>
      </div>
      <span
        class="absolute top-3 right-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset"
        :class="statusBadge.cls"
      >
        {{ statusBadge.label }}
      </span>
    </div>

    <div class="flex flex-1 flex-col p-4">
      <h3 data-testid="auction-item-name" class="text-sm font-bold text-gray-900 line-clamp-2">
        {{ item.name }}
      </h3>
      <a
        v-if="item.games?.[0]?.bggId"
        :href="`https://boardgamegeek.com/boardgame/${item.games[0].bggId}`"
        target="_blank"
        rel="noopener"
        class="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:text-orange-700"
        @click.stop
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
        View on BGG
      </a>
      <span
        v-if="item.games?.length > 1"
        class="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-purple-600"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        Package · {{ item.games.length }} games
      </span>
      <div class="mt-auto flex items-end justify-between pt-3">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {{ item.currentBid ? 'Current bid' : 'Starting' }}
          </p>
          <p data-testid="auction-item-current-bid" class="text-lg font-extrabold text-indigo-700 tabular-nums">
            {{ currentBidLabel }}
          </p>
        </div>
        <p data-testid="auction-item-bid-count" class="text-xs font-bold text-gray-400">
          {{ item.bidCount || 0 }} {{ item.bidCount === 1 ? 'bid' : 'bids' }}
        </p>
      </div>
    </div>
  </RouterLink>
</template>
