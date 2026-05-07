<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRafflesStore } from '../stores/raffles'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

const props = defineProps({
  eventId: { type: String, required: true },
  raffleId: { type: String, required: true },
  raffle: { type: Object, required: true }
})

const store = useRafflesStore()
const router = useRouter()

const locking = ref(false)
const lockError = ref(null)
const opening = ref(false)
const showLockConfirm = ref(false)
const openError = ref(null)

const draws = computed(() => store.draws.get(props.raffleId) ?? [])
const isOpen = computed(() => props.raffle?.status === 'Open')
const isDrawing = computed(() => props.raffle?.status === 'Drawing')
const showLock = computed(() => isOpen.value && props.raffle?.selfReportingEnabled)

async function loadDraws() {
  try {
    await store.fetchDraws(props.eventId, props.raffleId)
  } catch { /* best-effort */ }
}

function requestLock() {
  showLockConfirm.value = true
}

async function lockSubmissions() {
  showLockConfirm.value = false
  locking.value = true
  lockError.value = null
  try {
    await store.patchRaffle(props.eventId, props.raffleId, { selfReportingEnabled: false })
  } catch (err) {
    lockError.value = err.message || 'Failed to lock submissions.'
  } finally {
    locking.value = false
  }
}

async function openDrawStage() {
  opening.value = true
  openError.value = null
  try {
    if (isOpen.value) {
      try {
        await store.startDraw(props.eventId, props.raffleId)
      } catch (err) {
        // 409 = already in Drawing state, which is fine. Anything else bubbles.
        if (!/already.*drawing/i.test(err.message || '')) throw err
      }
    }
    router.push({ name: 'raffle-present', params: { id: props.eventId, raffleId: props.raffleId } })
  } catch (err) {
    openError.value = err.message || 'Failed to open draw stage.'
    opening.value = false
  }
}

function formatDrawDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  loadDraws()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Console Control Panel -->
    <div class="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div class="bg-gray-50 border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <h4 class="text-sm font-bold text-gray-900 uppercase tracking-widest">Draw Console</h4>
        <span v-if="isDrawing" class="flex h-2 w-2 relative">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>

      <div class="p-6 space-y-4">
        <!-- Lock submissions (only when self-reporting is on and raffle is Open) -->
        <div v-if="showLock" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex-1">
            <p class="text-sm font-semibold text-gray-900">Submissions are open</p>
            <p class="text-xs text-gray-500 mt-1 max-w-sm">
              Participants can self-report their tickets. Lock submissions when you are ready to stop changes.
            </p>
          </div>
          <button
            type="button"
            data-testid="raffle-lock-submissions-btn"
            :disabled="locking"
            @click="requestLock"
            class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg shrink-0"
          >
            <svg v-if="locking" class="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>{{ locking ? 'Locking…' : 'Lock User Submissions' }}</span>
          </button>
        </div>
        <p v-if="lockError" class="text-xs text-red-600 font-medium">{{ lockError }}</p>

        <!-- Navigate to draw stage (always available except when self-report banner is showing) -->
        <div v-if="!showLock" class="space-y-3">
          <p class="text-sm text-gray-600">Winners are drawn from the presentation view — open it to begin.</p>
          <button
            type="button"
            data-testid="raffle-draw-stage-btn"
            :disabled="opening"
            title="Open the draw stage"
            @click="openDrawStage"
            class="w-full relative inline-flex justify-center items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-base lg:text-lg font-black uppercase tracking-widest rounded-xl hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg hover:shadow-emerald-500/30 overflow-hidden transform active:scale-[0.98] group"
          >
            <div class="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:translate-x-[250%] transition-transform duration-1000"></div>
            <svg v-if="opening" class="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            {{ opening ? 'Opening…' : 'Open Draw Stage' }}
          </button>
          <p v-if="openError" class="text-xs text-red-600 font-medium">{{ openError }}</p>
        </div>
      </div>
    </div>

    <!-- Draw history list -->
    <div v-if="draws.length" class="space-y-3">
      <p class="text-xs font-bold uppercase tracking-widest text-gray-500">Draw History</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="raffle-history-list">
        <div
          v-for="(draw, i) in draws"
          :key="draw.id"
          :data-testid="`raffle-history-row-${draw.id}`"
          class="flex items-center p-3 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow transition-shadow relative overflow-hidden"
        >
          <div class="absolute top-0 bottom-0 left-0 w-1.5 bg-gradient-to-b from-emerald-400 to-emerald-600"></div>
          <div class="flex-1 min-w-0 pl-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-emerald-600 uppercase tracking-wider">#{{ draws.length - i }}</span>
              <span class="font-bold text-gray-900 truncate" :title="draw.displayName">{{ draw.displayName }}</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {{ formatDrawDate(draw.drawnAt) }}
              </span>
            </div>
          </div>
          <div class="shrink-0 flex flex-col items-end pl-2 border-l border-gray-100">
            <span class="text-xs font-black text-gray-400 uppercase tracking-widest">Left</span>
            <span class="text-lg font-black tracking-tighter" :class="draw.ticketsAfter > 0 ? 'text-indigo-600' : 'text-gray-300'">
              {{ draw.ticketsAfter }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="showLockConfirm"
      variant="warning"
      title="Lock user submissions?"
      message="Participants will no longer be able to add or change their own ticket counts. You can still adjust ticket counts as host."
      confirmLabel="Lock submissions"
      cancelLabel="Keep open"
      @confirm="lockSubmissions"
      @cancel="showLockConfirm = false"
    />
  </div>
</template>