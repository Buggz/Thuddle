<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useAuthStore } from '@/features/auth/stores/auth'
import { formatCurrency } from '@/shared/formatCurrency'
import AuctionItemImageCarousel from '@/features/auctions/components/AuctionItemImageCarousel.vue'
import AuctionTimeline from '@/features/auctions/components/AuctionTimeline.vue'
import BidPanel from '@/features/auctions/components/BidPanel.vue'
import BidHistoryList from '@/features/auctions/components/BidHistoryList.vue'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'

const route = useRoute()
const auctionStore = useAuctionStore()
const auth = useAuthStore()

const eventId = computed(() => String(route.params.id))
const itemId = computed(() => String(route.params.itemId))

const { settingsByEvent, itemsByEvent, bidsByItem } = storeToRefs(auctionStore)

const settings = computed(() => settingsByEvent.value[eventId.value] || null)
const item = computed(() => (itemsByEvent.value[eventId.value] || {})[itemId.value] || null)
const bids = computed(() => bidsByItem.value[itemId.value] || [])

const loading = shallowRef(true)
const loadError = shallowRef('')
const placing = ref(false)
const placeError = ref('')

const isLive = computed(() => item.value?.status === 'Live' && settings.value?.status === 'Live')

const isOwnItem = computed(() => {
  if (!auth.isAuthenticated || !item.value) return false
  // submittedByUserId is a backend Guid; we don't carry the user's backend id
  // on the client. The most reliable signal we have is: the API returned the
  // item with the submittedByUserId, but the client only knows its keycloak
  // sub. The server enforces "no own bids", so this is a UI hint only.
  return false
})

const canBid = computed(() =>
  auth.isAuthenticated && isLive.value && !isOwnItem.value
)

async function refresh() {
  loading.value = true
  loadError.value = ''
  try {
    if (!settings.value?.configured) {
      await auctionStore.loadAuction(eventId.value)
    }
    await Promise.all([
      auctionStore.loadItem(eventId.value, itemId.value),
      auctionStore.loadBids(eventId.value, itemId.value)
    ])
  } catch (err) {
    loadError.value = err.message || 'Failed to load item.'
  } finally {
    loading.value = false
  }
}

watch(() => bids.value.length, () => {
  // Fresh bids may have changed the current bid; clear the placeError so the
  // next attempt isn't haunted by the last one.
  placeError.value = ''
})

async function onPlaceBid({ amount, idempotencyKey }) {
  placing.value = true
  placeError.value = ''
  try {
    await auctionStore.placeBid(eventId.value, itemId.value, amount, idempotencyKey)
    // Realtime will push the authoritative state, but reload bids+item now too
    // so the UI reflects the change without waiting for the round-trip.
    await Promise.all([
      auctionStore.loadItem(eventId.value, itemId.value),
      auctionStore.loadBids(eventId.value, itemId.value)
    ])
  } catch (err) {
    placeError.value = err.message || 'Bid rejected.'
  } finally {
    placing.value = false
  }
}

async function onBuyout({ idempotencyKey }) {
  placing.value = true
  placeError.value = ''
  try {
    await auctionStore.buyout(eventId.value, itemId.value, idempotencyKey)
    await Promise.all([
      auctionStore.loadItem(eventId.value, itemId.value),
      auctionStore.loadBids(eventId.value, itemId.value)
    ])
  } catch (err) {
    placeError.value = err.message || 'Buyout failed.'
  } finally {
    placing.value = false
  }
}

onMounted(async () => {
  await refresh()
  if (auth.isAuthenticated) await auctionStore.subscribeRealtime(eventId.value)
})

watch(() => route.params.itemId, () => refresh())

onBeforeUnmount(() => {
  // Don't unsubscribe — the parent AuctionView may also want updates. The
  // auction store dedupes subscriptions per event id.
})
</script>

<template>
  <div class="max-w-6xl mx-auto">
    <RouterLink
      :to="{ name: 'auction', params: { id: eventId } }"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      All items
    </RouterLink>

    <div v-if="loading" class="py-16">
      <FunnyLoader title="Loading item" />
    </div>

    <div v-else-if="loadError" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ loadError }}
    </div>

    <template v-else-if="item">
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <!-- Left: imagery -->
        <div class="space-y-4">
          <AuctionItemImageCarousel :images="item.imageUrls || []" :alt="item.name" />
          <div v-if="item.submittedByName && !settings?.anonymousBidHistory" class="text-xs text-gray-500">
            Submitted by <span class="font-semibold text-gray-700">{{ item.submittedByName }}</span>
          </div>
        </div>

        <!-- Right: details + bidding -->
        <div class="space-y-4">
          <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h1 data-testid="auction-item-name" class="text-2xl font-extrabold text-gray-900">{{ item.name }}</h1>
            <p v-if="item.description" class="mt-2 text-sm text-gray-600 whitespace-pre-line">{{ item.description }}</p>

            <div class="mt-4 flex items-end justify-between">
              <div>
                <p class="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {{ item.currentBid ? 'Current bid' : 'Starting bid' }}
                </p>
                <p data-testid="auction-item-current-bid" class="text-3xl font-extrabold text-indigo-700 tabular-nums">
                  {{ formatCurrency(item.currentBid ?? item.startingBid, settings?.currency) }}
                </p>
              </div>
              <p data-testid="auction-item-bid-count" class="text-sm font-bold text-gray-500">
                {{ item.bidCount || 0 }} {{ item.bidCount === 1 ? 'bid' : 'bids' }}
              </p>
            </div>
          </div>

          <AuctionTimeline
            v-if="settings?.startsAt && settings?.latestEndsAt"
            :starts-at="settings.startsAt"
            :latest-ends-at="settings.latestEndsAt"
            :earliest-ends-at="settings.earliestEndsAt"
            :veiled-close-window-seconds="settings.veiledCloseWindow || 0"
            :server-time="settings.serverTime"
            :status="settings.status"
          />

          <BidPanel
            v-if="auth.isAuthenticated && item.status === 'Live'"
            :item="item"
            :currency="settings?.currency || ''"
            :min-bid-increment="Number(settings?.minBidIncrement) || 1"
            :allow-buyout="!!settings?.allowBuyout"
            :is-live="isLive"
            :can-bid="canBid"
            :pending="placing"
            :error-message="placeError"
            @place-bid="onPlaceBid"
            @buy-out="onBuyout"
          />
          <div
            v-else-if="item.status === 'Sold'"
            class="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800"
          >
            Sold for {{ formatCurrency(item.finalPrice, settings?.currency) }}.
          </div>
          <div
            v-else-if="item.status === 'Unsold'"
            class="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm font-bold text-gray-600"
          >
            This item closed without a winning bid.
          </div>
          <div
            v-else-if="!auth.isAuthenticated"
            class="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600"
          >
            Sign in to place a bid.
          </div>
        </div>
      </div>

      <div class="mt-6">
        <BidHistoryList :bids="bids" :currency="settings?.currency || ''" />
      </div>
    </template>
  </div>
</template>
