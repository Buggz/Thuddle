<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useEventsStore } from '@/features/events/stores/events'
import ModerationQueuePanel from '../components/ModerationQueuePanel.vue'

const route = useRoute()
const eventsStore = useEventsStore()
const slug = computed(() => String(route.params.slug))
const eventId = computed(() => eventsStore.slugToId[slug.value] ?? null)
const auctionStore = useAuctionStore()

const accessDenied = ref(false)

// Use the store error property to detect 403 if it gets recorded there.
// If the api throws 403, errorByEvent might contain the message.
const error = computed(() => auctionStore.errorByEvent[eventId.value])

watch(error, (newErr) => {
  // If the server returns a 403, authFetch usually rejects with a specific message or status.
  // We can look for common 403 / "forbidden" strings or we can just rely on the error.
  if (newErr && newErr.toLowerCase().includes('forbidden')) {
    accessDenied.value = true
  }
})
</script>

<template>
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
    <div class="md:flex md:items-center md:justify-between">
      <div class="min-w-0 flex-1">
        <h2 class="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
          Moderation queue
        </h2>
        <div class="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
          <div class="mt-2 flex items-center text-sm text-gray-500">
            <RouterLink 
              :to="{ name: 'auction', params: { slug: slug } }"
              class="hover:text-indigo-600 hover:underline"
            >
              &larr; Back to Auction
            </RouterLink>
          </div>
        </div>
      </div>
    </div>

    <!-- We detect 403 dynamically or from the store's error -->
    <div v-if="error && error.toLowerCase().includes('forbidden')" class="rounded-xl bg-red-50 p-6 shadow-sm border border-red-100 text-center text-red-800">
      <div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 mb-4">
        <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 class="text-lg font-medium">Access Denied</h3>
      <p class="mt-2 text-sm text-red-700 text-center">You don't have access to this queue. Only event admins can moderate items.</p>
    </div>

    <!-- Normal View -->
    <ModerationQueuePanel v-else :event-id="eventId" />
  </div>
</template>