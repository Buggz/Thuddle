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
import PublishItemDialog from '@/features/auctions/components/PublishItemDialog.vue'
import UnpublishDialog from '@/features/auctions/components/UnpublishDialog.vue'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'
import { useRouter } from 'vue-router'

const route = useRoute()
const auctionStore = useAuctionStore()
const auth = useAuthStore()
const router = useRouter()

const eventId = computed(() => String(route.params.id))
const itemId = computed(() => String(route.params.itemId))

const { settingsByEvent, itemsByEvent, bidsByItem } = storeToRefs(auctionStore)

const settings = computed(() => settingsByEvent.value[eventId.value] || null)
const item = computed(() => (itemsByEvent.value[eventId.value] || {})[itemId.value] || null)
const bids = computed(() => bidsByItem.value[itemId.value] || [])
const displayImages = computed(() => {
  const uploadedImages = item.value?.imageUrls || []
  const packageImages = (item.value?.games || []).map((game) => game.imageUrl)

  const orderedImages = [...uploadedImages, ...packageImages]
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

const isPublishDialogOpen = ref(false)
const isUnpublishDialogOpen = ref(false)
const publishing = ref(false)
const unpublishing = ref(false)
const resubmitting = ref(false)

const isLive = computed(() => item.value?.status === 'Live' && settings.value?.status === 'Live')

const isOwnItem = computed(() => {
  if (!auth.isAuthenticated || !item.value) return false
  return item.value.submittedByUserId === auth.user?.id
})

const canBid = computed(() =>
  auth.isAuthenticated && isLive.value && !isOwnItem.value
)

const currentTime = ref(Date.now())

const secondsToStart = computed(() => {
  if (!settings.value?.startsAt) return null
  const diffMs = new Date(settings.value.startsAt).getTime() - currentTime.value
  return Math.max(0, Math.floor(diffMs / 1000))
})

const countdownText = computed(() => {
  if (secondsToStart.value === null || secondsToStart.value <= 0) return null
  const s = secondsToStart.value
  if (s < 60) return '<1m'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return `${h}h ${m}m`
  }
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  return `${d}d ${h}h`
})

let countdownInterval = null

async function confirmPublish() {
  publishing.value = true
  try {
    await auctionStore.publishItem(eventId.value, itemId.value)
    isPublishDialogOpen.value = false
    await refresh()
  } catch (err) {
    placeError.value = err.message || 'Failed to publish item.'
  } finally {
    publishing.value = false
  }
}

async function confirmUnpublish() {
  unpublishing.value = true
  try {
    await auctionStore.unpublishItem(eventId.value, itemId.value)
    isUnpublishDialogOpen.value = false
    await refresh()
  } catch (err) {
    placeError.value = err.message || 'Failed to unpublish item.'
  } finally {
    unpublishing.value = false
  }
}

async function handleResubmit() {
  resubmitting.value = true
  try {
    await auctionStore.resubmitItem(eventId.value, itemId.value)
    router.push({ name: 'auction-edit', params: { id: eventId.value, itemId: itemId.value } })
  } catch (err) {
    placeError.value = err.message || 'Failed to resubmit item.'
  } finally {
    resubmitting.value = false
  }
}

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
  countdownInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

watch(() => route.params.itemId, () => refresh())

onBeforeUnmount(() => {
  if (countdownInterval) clearInterval(countdownInterval)
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

    <!-- Status-aware UI for submitter -->
    <section v-if="item && isOwnItem">
      <!-- Draft -->
      <template v-if="item.status === 'Draft'">
        <div data-testid="draft-banner" class="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
          This is a draft. Only you can see it.
        </div>
        <div class="sticky bottom-0 -mx-4 sm:mx-0 mt-6 bg-white/95 backdrop-blur border-t sm:border border-gray-200 sm:rounded-2xl px-4 py-3 sm:py-4 sm:shadow-lg flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 z-10">
          <RouterLink
            :to="{ name: 'auction-edit', params: { id: eventId, itemId: itemId } }"
            class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Edit draft
          </RouterLink>
          <button
            data-testid="publish-button"
            @click="isPublishDialogOpen = true"
            class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            Publish to auction
          </button>
        </div>
      </template>

      <!-- PendingApproval -->
      <template v-else-if="item.status === 'PendingApproval'">
        <div data-testid="pending-banner" class="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
          Waiting for a host to approve your item. We'll notify you.
        </div>
        <div class="sticky bottom-0 -mx-4 sm:mx-0 mt-6 bg-white/95 backdrop-blur border-t sm:border border-gray-200 sm:rounded-2xl px-4 py-3 sm:py-4 sm:shadow-lg flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 z-10">
          <button
            data-testid="unpublish-button"
            @click="isUnpublishDialogOpen = true"
            class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Unpublish to draft
          </button>
        </div>
      </template>

      <!-- Scheduled -->
      <template v-else-if="item.status === 'Scheduled'">
        <div data-testid="scheduled-banner" class="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-900">
          Approved. Will go live when the auction starts in {{ countdownText || 'moments' }}.
        </div>
        <div class="sticky bottom-0 -mx-4 sm:mx-0 mt-6 bg-white/95 backdrop-blur border-t sm:border border-gray-200 sm:rounded-2xl px-4 py-3 sm:py-4 sm:shadow-lg flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 z-10">
          <button
            data-testid="unpublish-button"
            @click="isUnpublishDialogOpen = true"
            class="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Unpublish to draft
          </button>
        </div>
      </template>

      <!-- Rejected -->
      <template v-else-if="item.status === 'Rejected'">
        <div data-testid="rejection-banner" class="mb-4 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-900">
          Your item was withdrawn from the auction by a host.
          <p v-if="item.rejectionReason" class="mt-2 italic text-sm text-red-800/80" data-testid="rejection-reason">{{ item.rejectionReason }}</p>
        </div>
        <template v-if="item.resubmitAllowed">
          <div class="sticky bottom-0 -mx-4 sm:mx-0 mt-6 bg-white/95 backdrop-blur border-t sm:border border-gray-200 sm:rounded-2xl px-4 py-3 sm:py-4 sm:shadow-lg flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 z-10">
            <button
              data-testid="resubmit-button"
              @click="handleResubmit"
              :disabled="resubmitting"
              class="inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
            >
              Edit and resubmit
            </button>
          </div>
        </template>
        <p v-else class="mt-2 text-sm text-gray-500" data-testid="cannot-republish-tag">
          This item is no longer available for republishing. You may submit a new item if the auction allows.
        </p>
      </template>
    </section>

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
              <BoardGameCredibility v-if="item.games?.[0]?.bggId" class="mt-2.5" :bgg-id="item.games[0].bggId" />
            </div>

            <div v-if="item.description" class="mt-4 flex-1 rounded-xl border border-gray-100 bg-gray-50/70 p-4 lg:p-5">
              <p class="text-sm leading-7 text-gray-700 whitespace-pre-line">{{ item.description }}</p>
            </div>

            <div
              v-if="item.games?.length > 1"
              :class="item.description ? 'mt-4 border-t border-gray-100 pt-4' : 'mt-4'"
            >
              <p class="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                Package includes {{ item.games.length }} games
              </p>
              <div class="space-y-3">
                <div v-for="game in item.games" :key="game.bggId" class="flex items-start gap-3">
                  <img v-if="game.thumbnailUrl" :src="game.thumbnailUrl" alt="" class="mt-0.5 h-10 w-10 rounded-lg object-cover shadow-sm" />
                  <div v-else class="mt-0.5 h-10 w-10 rounded-lg bg-gray-100 shadow-sm" />
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span class="text-sm font-bold text-gray-900">{{ game.name }}</span>
                      <span v-if="game.yearPublished" class="text-xs text-gray-500">({{ game.yearPublished }})</span>
                    </div>
                    <BoardGameCredibility :bgg-id="game.bggId" compact class="mt-1" />
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

    <!-- Dialogs -->
    <PublishItemDialog
      :is-open="isPublishDialogOpen"
      :auction-status="settings?.status"
      :moderation-policy="settings?.itemModerationPolicy"
      :is-admin="false"
      :seconds-to-start="secondsToStart"
      :submitting="publishing"
      @confirm="confirmPublish"
      @cancel="isPublishDialogOpen = false"
    />
    <UnpublishDialog
      :is-open="isUnpublishDialogOpen"
      :auction-status="settings?.status"
      :moderation-policy="settings?.itemModerationPolicy"
      :is-admin="false"
      :seconds-to-start="secondsToStart"
      :submitting="unpublishing"
      @confirm="confirmUnpublish"
      @cancel="isUnpublishDialogOpen = false"
    />
  </div>
</template>
