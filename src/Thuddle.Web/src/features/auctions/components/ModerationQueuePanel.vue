<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuctionStore } from '../stores/auction'
import { formatCurrency } from '@/shared/formatCurrency'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'
import RejectItemDialog from './RejectItemDialog.vue'

const props = defineProps({
  eventId: {
    type: String,
    required: true
  },
  eventSlug: {
    type: String,
    required: true
  }
})

const auctionStore = useAuctionStore()

const loading = computed(() => auctionStore.loadingModerationByEvent[props.eventId])
const queue = computed(() => auctionStore.moderationQueueByEvent[props.eventId] || [])

const isRejectDialogOpen = ref(false)
const rejectingItemId = ref(null)
const rejectingItemName = ref('')
const submittingReject = ref(false)
const localErrors = ref({})

onMounted(() => {
  auctionStore.loadModerationQueue(props.eventId)
  auctionStore.subscribeRealtime(props.eventId)
})

async function onApprove(itemId) {
  localErrors.value[itemId] = null
  try {
    await auctionStore.approveItem(props.eventId, itemId)
  } catch (err) {
    localErrors.value[itemId] = err.message || 'Approval failed'
  }
}

function openRejectDialog(item) {
  rejectingItemId.value = item.id
  rejectingItemName.value = item.name
  isRejectDialogOpen.value = true
}

async function onRejectConfirm({ reason, allowResubmit }) {
  if (!rejectingItemId.value) return
  submittingReject.value = true
  const id = rejectingItemId.value
  localErrors.value[id] = null
  try {
    await auctionStore.rejectItem(props.eventId, id, { reason, allowResubmit })
    isRejectDialogOpen.value = false
  } catch (err) {
    localErrors.value[id] = err.message || 'Reject failed'
  } finally {
    submittingReject.value = false
  }
}

function getThumbnail(item) {
  if (item.imageUrls?.length) {
    return item.imageUrls[0]
  }
  if (item.games?.length && item.games[0].thumbnailUrl) {
    return item.games[0].thumbnailUrl
  }
  return null
}
</script>

<template>
  <div data-testid="moderation-queue-list" class="space-y-4">
    <div v-if="loading && !queue.length" class="flex justify-center p-8">
      <FunnyLoader />
    </div>
    
    <div v-else-if="!queue.length" data-testid="moderation-queue-empty" class="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
      Nothing pending review. C'est magnifique!
    </div>
    
    <div v-else class="space-y-4">
      <div 
        v-for="item in queue" 
        :key="item.id" 
        :data-testid="`moderation-item-${item.id}`"
        class="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div class="h-16 w-16 shrink-0 overflow-hidden rounded bg-gray-100 flex items-center justify-center">
          <img v-if="getThumbnail(item)" :src="getThumbnail(item)" class="h-full w-full object-cover" />
          <svg v-else class="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <RouterLink 
              :to="{ name: 'auction-item', params: { slug: eventSlug, itemId: item.id } }"
              class="font-bold text-gray-900 hover:text-indigo-600 truncate"
            >
              {{ item.name }}
            </RouterLink>
            <span 
              class="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold"
              :class="{
                'bg-amber-100 text-amber-800': item.status === 'PendingApproval',
                'bg-emerald-100 text-emerald-800': item.status === 'Live',
                'bg-indigo-100 text-indigo-800': item.status === 'Scheduled'
              }"
            >
              {{ item.status }}
            </span>
          </div>
          <div class="mt-1 text-sm text-gray-500 flex items-center gap-2">
             <span>By {{ item.submittedByName }}</span>
             <span>•</span>
             <span class="font-medium text-gray-900">Start: {{ formatCurrency(item.startingBid) }}</span>
          </div>
          <div v-if="localErrors[item.id]" class="mt-2 text-sm text-red-600 font-medium">
            {{ localErrors[item.id] }}
          </div>
        </div>

        <div class="flex w-full sm:w-auto items-center gap-2 mt-2 sm:mt-0">
          <button 
            v-if="item.status === 'PendingApproval'"
            data-testid="moderation-approve-btn"
            @click="onApprove(item.id)"
            class="flex-1 sm:flex-none inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Approve
          </button>
          <button 
            data-testid="moderation-reject-btn"
            @click="openRejectDialog(item)"
            class="flex-1 sm:flex-none inline-flex items-center justify-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Reject
          </button>
        </div>
      </div>
    </div>

    <RejectItemDialog 
      :open="isRejectDialogOpen" 
      :item-name="rejectingItemName" 
      :submitting="submittingReject"
      @cancel="isRejectDialogOpen = false"
      @confirm="onRejectConfirm"
    />
  </div>
</template>