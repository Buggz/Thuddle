<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useAuthStore } from '@/features/auth/stores/auth'
import { formatCurrency } from '@/shared/formatCurrency'
import AuctionItemImageCarousel from '@/features/auctions/components/AuctionItemImageCarousel.vue'
import AuctionTimeline from '@/features/auctions/components/AuctionTimeline.vue'
import BoardGameCredibility from '@/features/auctions/components/BoardGameCredibility.vue'
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
const displayImages = computed(() => {
  const uploadedImages = item.value?.imageUrls || []
  const bggImageUrl = item.value?.bggImageUrl

  const orderedImages = bggImageUrl ? [bggImageUrl, ...uploadedImages] : uploadedImages
  const seen = new Set()

  return orderedImages.filter((url) => {
    if (!url || seen.has(url)) return false
    seen.add(url)
    return true
  })
})

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
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6">
        <div class="space-y-3 lg:space-y-4">
          <AuctionItemImageCarousel :images="displayImages" :alt="item.name" />

          <div class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:p-5">
            <div class="flex items-end justify-between">
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

        <div class="flex">
          <div class="flex h-full w-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:h-full lg:p-6">
            <div>
              <h1 data-testid="auction-item-name" class="text-2xl font-extrabold leading-tight tracking-tight text-gray-900">{{ item.name }}</h1>
              <p v-if="item.submittedByName && !settings?.anonymousBidHistory" class="mt-1 text-xs leading-5 text-gray-500">
                Submitted by <span class="font-semibold text-gray-700">{{ item.submittedByName }}</span>
              </p>
              <BoardGameCredibility v-if="item.bggId" class="mt-2.5" :bgg-id="item.bggId" />
            </div>

            <div v-if="item.description" class="mt-4 flex-1 rounded-xl border border-gray-100 bg-gray-50/70 p-4 lg:p-5">
              <p class="text-sm leading-7 text-gray-700 whitespace-pre-line">{{ item.description }}</p>
            </div>

            <div
              v-if="item.extraGames?.length"
              :class="item.description ? 'mt-4 border-t border-gray-100 pt-4' : 'mt-4'"
            >
              <p class="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                Package includes {{ item.extraGames.length + 1 }} games
              </p>
              <div class="space-y-1.5">
                <div v-if="item.bggId" class="flex items-center gap-2">
                  <img v-if="item.bggImageUrl" :src="item.bggImageUrl" alt="" class="h-7 w-7 rounded object-cover" />
                  <span class="text-sm font-semibold text-gray-900">{{ item.name }}</span>
                  <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 uppercase">Primary</span>
                </div>
                <div v-for="game in item.extraGames" :key="game.bggId" class="flex items-start gap-2">
                  <img v-if="game.thumbnailUrl" :src="game.thumbnailUrl" alt="" class="mt-0.5 h-7 w-7 rounded object-cover" />
                  <div v-else class="mt-0.5 h-7 w-7 rounded bg-gray-100" />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="text-sm text-gray-700">{{ game.name }}</span>
                      <span v-if="game.yearPublished" class="text-xs text-gray-400">({{ game.yearPublished }})</span>
                    </div>
                    <BoardGameCredibility :bgg-id="game.bggId" compact />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6">
        <BidHistoryList :bids="bids" :currency="settings?.currency || ''" />
      </div>
    </template>
  </div>
</template>
