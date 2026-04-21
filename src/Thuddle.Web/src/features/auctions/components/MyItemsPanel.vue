<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useRouter, RouterLink } from 'vue-router'
import PublishItemDialog from './PublishItemDialog.vue'
import UnpublishDialog from './UnpublishDialog.vue'

const props = defineProps({ eventId: { type: String, required: true } })
const auctionStore = useAuctionStore()
const router = useRouter()
const { myItemsByEvent, settingsByEvent } = storeToRefs(auctionStore)

const myItems = computed(() => Object.values(myItemsByEvent.value[props.eventId] || {}))
const settings = computed(() => settingsByEvent.value[props.eventId] || null)

const drafts = computed(() => myItems.value.filter(i => i.status === 'Draft'))
const pending = computed(() => myItems.value.filter(i => i.status === 'PendingApproval'))
const scheduled = computed(() => myItems.value.filter(i => i.status === 'Scheduled'))
const withdrawnByHost = computed(() => myItems.value.filter(i => i.status === 'Rejected'))
const active = computed(() => myItems.value.filter(i => ['Live', 'Sold', 'Unsold', 'Withdrawn'].includes(i.status)))

const expanded = ref(true)

const selectedItem = ref(null)
const showPublishDialog = ref(false)
const showUnpublishDialog = ref(false)
const dialogSubmitting = ref(false)

const currentTime = ref(Date.now())
let countdownInterval = null

const secondsToStart = computed(() => {
  if (!settings.value?.startsAt) return null
  const diffMs = new Date(settings.value.startsAt).getTime() - currentTime.value
  return Math.max(0, Math.floor(diffMs / 1000))
})

function formatCountdown(seconds) {
  if (seconds === null || seconds <= 0) return null
  if (seconds < 60) return '<1m'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  return `${d}d ${h}h`
}

function openPublishDialog(item) {
  selectedItem.value = item
  showPublishDialog.value = true
}

function openUnpublishDialog(item) {
  selectedItem.value = item
  showUnpublishDialog.value = true
}

async function confirmPublish() {
  dialogSubmitting.value = true
  try {
    await auctionStore.publishItem(props.eventId, selectedItem.value.id)
    showPublishDialog.value = false
  } finally {
    dialogSubmitting.value = false
  }
}

async function confirmUnpublish() {
  dialogSubmitting.value = true
  try {
    await auctionStore.unpublishItem(props.eventId, selectedItem.value.id)
    showUnpublishDialog.value = false
  } finally {
    dialogSubmitting.value = false
  }
}

async function handleResubmit(item) {
  await auctionStore.resubmitItem(props.eventId, item.id)
  router.push({ name: 'auction-edit', params: { id: props.eventId, itemId: item.id } })
}

onMounted(() => {
  auctionStore.loadMyItems(props.eventId)
  expanded.value = !(drafts.value.length === 0 && pending.value.length === 0 && scheduled.value.length === 0 && withdrawnByHost.value.length === 0)
  countdownInterval = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (countdownInterval) clearInterval(countdownInterval)
})
</script>

<template>
  <section v-if="myItems.length > 0" data-testid="my-items-panel" class="mb-6 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
    <header class="flex items-center justify-between mb-3">
      <h2 class="text-base font-extrabold text-gray-900">Your items <span class="ml-1 text-xs font-bold text-gray-500">({{ myItems.length }})</span></h2>
      <button type="button" @click="expanded = !expanded" class="text-gray-400 hover:text-gray-600">
        <svg class="w-5 h-5 transition-transform" :class="{ 'rotate-180': !expanded }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
    </header>
    <div v-if="expanded" class="space-y-3">
      <!-- Drafts -->
      <div v-if="drafts.length" data-testid="my-items-section-drafts" class="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <h3 class="text-sm font-bold text-amber-900 mb-2">Drafts ({{ drafts.length }})</h3>
        <div v-for="item in drafts" :key="item.id" class="flex items-center gap-3 py-2 border-t border-amber-100 first:border-0">
          <img v-if="item.images?.[0]?.url" :src="item.images[0].url" alt="" class="h-10 w-10 rounded-lg object-cover" />
          <div v-else class="h-10 w-10 rounded-lg bg-gray-200" />
          <div class="flex-1 min-w-0">
            <p class="font-bold text-gray-900 text-sm truncate">{{ item.name }}</p>
            <RouterLink :to="{ name: 'auction-edit', params: { id: eventId, itemId: item.id } }" class="text-xs text-amber-700 hover:underline">Continue editing →</RouterLink>
          </div>
          <span data-testid="item-status-badge" :data-status="item.status" class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 uppercase tracking-wide">Draft</span>
          <button type="button" @click="openPublishDialog(item)" data-testid="publish-button" class="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">Publish</button>
        </div>
      </div>

      <!-- Pending approval -->
      <div v-if="pending.length" data-testid="my-items-section-pending" class="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
        <h3 class="text-sm font-bold text-blue-900 mb-2">Pending approval ({{ pending.length }})</h3>
        <div v-for="item in pending" :key="item.id" class="flex items-center gap-3 py-2 border-t border-blue-100 first:border-0">
          <img v-if="item.images?.[0]?.url" :src="item.images[0].url" alt="" class="h-10 w-10 rounded-lg object-cover" />
          <div v-else class="h-10 w-10 rounded-lg bg-gray-200" />
          <div class="flex-1 min-w-0">
            <p class="font-bold text-gray-900 text-sm truncate">{{ item.name }}</p>
            <p class="text-xs text-blue-700">Awaiting host review</p>
          </div>
          <span data-testid="item-status-badge" :data-status="item.status" class="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wide">Pending</span>
          <button type="button" @click="openUnpublishDialog(item)" data-testid="unpublish-button" class="rounded-lg border border-blue-400 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50">Unpublish</button>
        </div>
      </div>

      <!-- Scheduled -->
      <div v-if="scheduled.length" data-testid="my-items-section-scheduled" class="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
        <h3 class="text-sm font-bold text-indigo-900 mb-2">Scheduled ({{ scheduled.length }})</h3>
        <div v-for="item in scheduled" :key="item.id" class="flex items-center gap-3 py-2 border-t border-indigo-100 first:border-0">
          <img v-if="item.images?.[0]?.url" :src="item.images[0].url" alt="" class="h-10 w-10 rounded-lg object-cover" />
          <div v-else class="h-10 w-10 rounded-lg bg-gray-200" />
          <div class="flex-1 min-w-0">
            <p class="font-bold text-gray-900 text-sm truncate">{{ item.name }}</p>
            <p class="text-xs text-indigo-700">Goes live in {{ formatCountdown(secondsToStart) || 'moments' }}</p>
          </div>
          <span data-testid="item-status-badge" :data-status="item.status" class="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 uppercase tracking-wide">Scheduled</span>
          <button type="button" @click="openUnpublishDialog(item)" data-testid="unpublish-button" class="rounded-lg border border-indigo-400 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">Unpublish</button>
        </div>
      </div>

      <!-- Withdrawn by host -->
      <div v-if="withdrawnByHost.length" data-testid="my-items-section-rejected" class="rounded-xl border border-red-200 bg-red-50/40 p-3">
        <h3 class="text-sm font-bold text-red-900 mb-2">Withdrawn by host ({{ withdrawnByHost.length }})</h3>
        <div v-for="item in withdrawnByHost" :key="item.id" class="flex items-center gap-3 py-2 border-t border-red-100 first:border-0">
          <img v-if="item.images?.[0]?.url" :src="item.images[0].url" alt="" class="h-10 w-10 rounded-lg object-cover" />
          <div v-else class="h-10 w-10 rounded-lg bg-gray-200" />
          <div class="flex-1 min-w-0">
            <p class="font-bold text-gray-900 text-sm truncate">{{ item.name }}</p>
            <p v-if="item.rejectionReason" class="text-xs text-red-800 truncate">{{ item.rejectionReason }}</p>
          </div>
          <span data-testid="item-status-badge" :data-status="item.status" class="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 uppercase tracking-wide">Rejected</span>
          <button type="button" v-if="item.resubmitAllowed" @click="handleResubmit(item)" data-testid="resubmit-button" class="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700">Resubmit</button>
          <span v-else data-testid="cannot-republish-tag" class="text-xs text-gray-500">Cannot republish</span>
        </div>
      </div>

      <!-- Active -->
      <div v-if="active.length" data-testid="my-items-section-active" class="rounded-xl border border-gray-200 bg-gray-50/40 p-3">
        <div class="flex items-center justify-between">
          <p class="text-sm text-gray-700">
            <span class="font-bold text-gray-900">{{ active.length }}</span> item{{ active.length === 1 ? '' : 's' }} on the auction floor
          </p>
          <a href="#auction-floor" class="text-xs font-bold text-indigo-600 hover:underline">View →</a>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <PublishItemDialog
      :is-open="showPublishDialog"
      :auction-status="settings?.status"
      :moderation-policy="settings?.itemModerationPolicy"
      :is-admin="false"
      :seconds-to-start="secondsToStart"
      :submitting="dialogSubmitting"
      @confirm="confirmPublish"
      @cancel="showPublishDialog = false"
    />
    <UnpublishDialog
      :is-open="showUnpublishDialog"
      :auction-status="settings?.status"
      :moderation-policy="settings?.itemModerationPolicy"
      :is-admin="false"
      :seconds-to-start="secondsToStart"
      :submitting="dialogSubmitting"
      @confirm="confirmUnpublish"
      @cancel="showUnpublishDialog = false"
    />
  </section>
</template>
