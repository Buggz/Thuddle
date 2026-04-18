<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/features/notifications/stores/notifications'
import { useAuthStore } from '@/features/auth/stores/auth'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'

const router = useRouter()
const notifications = useNotificationsStore()
const auth = useAuthStore()

const { list, totalCount, page, pageSize, loading, unreadCount, error } = storeToRefs(notifications)

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))
const hasPrev = computed(() => page.value > 1)
const hasNext = computed(() => page.value < totalPages.value)

async function loadPage(p) {
  await notifications.load({ page: p })
}

async function onPrev() { if (hasPrev.value) await loadPage(page.value - 1) }
async function onNext() { if (hasNext.value) await loadPage(page.value + 1) }

async function onRowClick(n) {
  if (!n.readAt) await notifications.markRead(n.id)
  const data = n.data || {}
  const eventId = data.eventId || data.EventId
  const itemId = data.auctionItemId || data.AuctionItemId || data.itemId
  const groupId = data.contactGroupId || data.GroupId
  let target = null
  switch (n.kind) {
    case 'AuctionItemSubmitted':
    case 'AuctionItemApproved':
    case 'AuctionItemSold':
    case 'AuctionOutbid':
    case 'AuctionStarting':
    case 'AuctionEnded':
      if (eventId && itemId) target = { name: 'auction-item', params: { id: eventId, itemId } }
      else if (eventId) target = { name: 'auction', params: { id: eventId } }
      break
    case 'EventInvite':
    case 'EventUpdated':
      if (eventId) target = { name: 'event', params: { id: eventId } }
      break
    case 'GroupInvite':
      if (groupId) target = { name: 'contact-group', params: { id: groupId } }
      break
  }
  if (target) router.push(target)
}

async function onMarkAll() {
  await notifications.markAllRead()
}

function fmtFull(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

onMounted(async () => {
  if (auth.isAuthenticated) await notifications.load({ page: 1 })
})

watch(() => auth.isAuthenticated, async (isAuth) => {
  if (isAuth) await notifications.load({ page: 1 })
})
</script>

<template>
  <div data-testid="notifications-view" class="max-w-3xl mx-auto">
    <header class="mb-6 flex items-end justify-between">
      <div>
        <h1 class="text-2xl font-extrabold text-gray-900">Notifications</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ totalCount }} total · <span class="font-bold text-indigo-700">{{ unreadCount }}</span> unread
        </p>
      </div>
      <button
        v-if="unreadCount > 0"
        type="button"
        data-testid="notifications-mark-all-read-btn"
        @click="onMarkAll"
        class="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
      >
        Mark all read
      </button>
    </header>

    <div v-if="error" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-if="loading && !list.length" class="py-16">
      <FunnyLoader title="Loading notifications" />
    </div>

    <div v-else-if="!list.length" class="rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center">
      <p class="text-sm text-gray-500">Nothing to report. Your inbox is unblemished.</p>
    </div>

    <ul v-else class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
      <li
        v-for="n in list"
        :key="n.id"
        :data-testid="`notification-row-${n.id}`"
        :data-read="n.readAt ? 'true' : 'false'"
      >
        <button
          type="button"
          @click="onRowClick(n)"
          class="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
          :class="!n.readAt ? 'bg-indigo-50/40' : ''"
        >
          <span
            v-if="!n.readAt"
            aria-hidden="true"
            class="mt-2 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500"
          />
          <span v-else class="mt-2 inline-block h-2 w-2 flex-shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-gray-900">{{ n.title }}</p>
            <p v-if="n.body" class="mt-0.5 text-sm text-gray-500">{{ n.body }}</p>
            <p class="mt-1 text-[11px] text-gray-400">{{ fmtFull(n.createdAt) }}</p>
          </div>
        </button>
      </li>
    </ul>

    <div v-if="totalPages > 1" class="mt-4 flex items-center justify-between">
      <button
        type="button"
        :disabled="!hasPrev"
        @click="onPrev"
        class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Previous
      </button>
      <span class="text-xs font-bold text-gray-500">Page {{ page }} of {{ totalPages }}</span>
      <button
        type="button"
        :disabled="!hasNext"
        @click="onNext"
        class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Next
      </button>
    </div>
  </div>
</template>
