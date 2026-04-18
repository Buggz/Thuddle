<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useNotificationsStore } from '@/features/notifications/stores/notifications'
import { useAuthStore } from '@/features/auth/stores/auth'

const router = useRouter()
const notifications = useNotificationsStore()
const auth = useAuthStore()

const { list, unreadCount } = storeToRefs(notifications)

const open = ref(false)
const root = ref(null)

const recent = computed(() => list.value.slice(0, 10))

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onClickOutside(e) {
  if (!root.value) return
  if (!root.value.contains(e.target)) close()
}

function onKeydown(e) {
  if (e.key === 'Escape') close()
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('mousedown', onClickOutside)
    document.removeEventListener('keydown', onKeydown)
  }
})

onMounted(async () => {
  if (auth.isAuthenticated) {
    await notifications.subscribeRealtime()
  }
})

watch(() => auth.isAuthenticated, async (isAuth) => {
  if (isAuth) await notifications.subscribeRealtime()
  else notifications.reset()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - Date.parse(iso)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function deepLinkFor(notification) {
  const data = notification.data || {}
  const eventId = data.eventId || data.EventId
  const itemId = data.auctionItemId || data.AuctionItemId || data.itemId
  const postId = data.discussionPostId || data.PostId
  const groupId = data.contactGroupId || data.GroupId

  switch (notification.kind) {
    case 'AuctionItemSubmitted':
    case 'AuctionItemApproved':
    case 'AuctionItemSold':
    case 'AuctionOutbid':
    case 'AuctionStarting':
    case 'AuctionEnded':
      if (eventId && itemId) return { name: 'auction-item', params: { id: eventId, itemId } }
      if (eventId) return { name: 'auction', params: { id: eventId } }
      break
    case 'EventInvite':
    case 'EventUpdated':
      if (eventId) return { name: 'event', params: { id: eventId } }
      break
    case 'DiscussionReply':
    case 'DiscussionMention':
      if (eventId) return { name: 'event', params: { id: eventId } }
      break
    case 'GroupInvite':
      if (groupId) return { name: 'contact-group', params: { id: groupId } }
      break
  }
  return null
}

async function activate(notification) {
  if (!notification.readAt) {
    await notifications.markRead(notification.id)
  }
  const target = deepLinkFor(notification)
  close()
  if (target) router.push(target)
}

async function onMarkAll() {
  await notifications.markAllRead()
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="notification-bell"
      :data-unread-count="unreadCount"
      :aria-label="unreadCount ? `${unreadCount} unread notifications` : 'Notifications'"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="toggle"
      class="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
      <span
        v-if="unreadCount > 0"
        data-testid="notification-bell-badge"
        class="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </button>

    <Transition name="bell-pop">
      <div
        v-if="open"
        data-testid="notification-bell-panel"
        class="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border border-gray-200 bg-white shadow-xl ring-1 ring-black/5"
        role="menu"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 class="text-sm font-bold text-gray-900">Notifications</h3>
          <button
            v-if="unreadCount > 0"
            type="button"
            data-testid="notification-mark-all-read-btn"
            @click="onMarkAll"
            class="text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            Mark all read
          </button>
        </div>

        <div class="max-h-96 overflow-y-auto">
          <ul v-if="recent.length" class="divide-y divide-gray-100">
            <li
              v-for="n in recent"
              :key="n.id"
              :data-testid="`notification-row-${n.id}`"
              :data-read="n.readAt ? 'true' : 'false'"
            >
              <button
                type="button"
                @click="activate(n)"
                class="block w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                :class="!n.readAt ? 'bg-indigo-50/40' : ''"
              >
                <div class="flex items-start gap-2">
                  <span
                    v-if="!n.readAt"
                    aria-hidden="true"
                    class="mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-indigo-500"
                  />
                  <span v-else class="mt-1.5 inline-block h-2 w-2 flex-shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900 truncate">{{ n.title }}</p>
                    <p v-if="n.body" class="mt-0.5 text-xs text-gray-500 line-clamp-2">{{ n.body }}</p>
                    <p class="mt-1 text-[11px] text-gray-400">{{ relTime(n.createdAt) }}</p>
                  </div>
                </div>
              </button>
            </li>
          </ul>
          <div v-else class="px-4 py-10 text-center text-sm text-gray-400">
            No notifications yet.
          </div>
        </div>

        <div class="border-t border-gray-100 px-4 py-2 text-right">
          <RouterLink
            :to="{ name: 'notifications' }"
            data-testid="notification-bell-view-all"
            @click="close"
            class="inline-block text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            View all
          </RouterLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bell-pop-enter-active, .bell-pop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.bell-pop-enter-from, .bell-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
