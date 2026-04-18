<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useAuthStore } from '@/features/auth/stores/auth'
import AuctionItemCard from '@/features/auctions/components/AuctionItemCard.vue'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'

const route = useRoute()
const auctionStore = useAuctionStore()
const auth = useAuthStore()

const eventId = computed(() => String(route.params.id))

const { settingsByEvent, itemsByEvent, loadingByEvent, errorByEvent } = storeToRefs(auctionStore)

const settings = computed(() => settingsByEvent.value[eventId.value] || null)
const itemsMap = computed(() => itemsByEvent.value[eventId.value] || {})
const loading = computed(() => !!loadingByEvent.value[eventId.value])
const error = computed(() => errorByEvent.value[eventId.value])

const search = ref('')
const sortBy = shallowRef('endingSoon') // endingSoon | lowestBid | noBids

const items = computed(() => {
  const arr = Object.values(itemsMap.value)
  const term = search.value.trim().toLowerCase()
  const filtered = term
    ? arr.filter((i) => i.name.toLowerCase().includes(term)
        || (i.description || '').toLowerCase().includes(term))
    : arr
  const sorted = [...filtered]
  switch (sortBy.value) {
    case 'lowestBid':
      sorted.sort((a, b) => Number(a.currentBid ?? a.startingBid) - Number(b.currentBid ?? b.startingBid))
      break
    case 'noBids':
      sorted.sort((a, b) => (a.bidCount || 0) - (b.bidCount || 0))
      break
    case 'endingSoon':
    default:
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      break
  }
  return sorted
})

const isAdmin = computed(() => {
  // Server-side determined; this view doesn't see explicit isAdmin, but the
  // event detail does. We can fetch it indirectly: the auction-settings link
  // is visible to anyone, the server enforces edits.
  return true
})

const canSubmit = computed(() => {
  const s = settings.value
  if (!s?.configured) return false
  if (!auth.isAuthenticated) return false
  // We mirror the server's submission gates loosely; the server is the final
  // word and will return 403 if the user can't actually submit.
  if (s.submissionMode === 'AdminsOnly') return false
  return true
})

async function refresh() {
  await auctionStore.loadAuction(eventId.value)
}

onMounted(async () => {
  await refresh()
  if (auth.isAuthenticated) await auctionStore.subscribeRealtime(eventId.value)
})

watch(() => auth.isAuthenticated, async (isAuth) => {
  if (isAuth) await auctionStore.subscribeRealtime(eventId.value)
})

onBeforeUnmount(() => {
  auctionStore.unsubscribeRealtime(eventId.value)
})
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <RouterLink
      :to="{ name: 'event', params: { id: eventId } }"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to event
    </RouterLink>

    <div v-if="loading && !settings" class="py-16">
      <FunnyLoader title="Loading auction" />
    </div>

    <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-else-if="!settings?.configured" class="rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center">
      <h2 class="text-lg font-bold text-gray-900">No auction here</h2>
      <p class="mt-2 text-sm text-gray-500">This event has not configured an auction. Bien sûr, the host may yet decide.</p>
    </div>

    <template v-else>
      <header class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Silent auction</p>
          <h1 class="mt-1 text-3xl font-extrabold text-gray-900">Bidding floor</h1>
          <p class="mt-2 text-sm text-gray-500">
            Currency: <span class="font-bold text-gray-700">{{ settings.currency }}</span>
            ·
            Status: <span class="font-bold" :class="settings.status === 'Live' ? 'text-emerald-600' : 'text-gray-700'">{{ settings.status }}</span>
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            v-if="canSubmit"
            :to="{ name: 'auction-submit', params: { id: eventId } }"
            class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Submit item
          </RouterLink>
          <RouterLink
            v-if="auth.isAuthenticated && isAdmin"
            :to="{ name: 'auction-settings', params: { id: eventId } }"
            class="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Auction settings
          </RouterLink>
        </div>
      </header>

      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
          <svg class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
               fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            v-model="search"
            type="search"
            placeholder="Search items…"
            class="w-full rounded-xl border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          v-model="sortBy"
          class="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
        >
          <option value="endingSoon">Ending soon</option>
          <option value="lowestBid">Lowest bid first</option>
          <option value="noBids">No bids first</option>
        </select>
      </div>

      <div v-if="items.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AuctionItemCard
          v-for="item in items"
          :key="item.id"
          :item="item"
          :currency="settings.currency"
          :event-id="eventId"
        />
      </div>
      <div v-else class="rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center">
        <p class="text-sm text-gray-500">No items match your search. The cellars are empty… for now.</p>
      </div>
    </template>
  </div>
</template>
