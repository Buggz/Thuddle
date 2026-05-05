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

const starting = ref(false)
const drawing = ref(false)
const drawError = ref(null)
const startError = ref(null)
const noTickets = ref(false)
const drawDialogOpen = ref(false)

const draws = computed(() => store.draws.get(props.raffleId) ?? [])
const isOpen = computed(() => props.raffle?.status === 'Open')
const isDrawing = computed(() => props.raffle?.status === 'Drawing')

async function loadDraws() {
  try {
    await store.fetchDraws(props.eventId, props.raffleId)
  } catch { /* best-effort */ }
}

async function handleStart() {
  starting.value = true
  startError.value = null
  try {
    await store.startDraw(props.eventId, props.raffleId)
  } catch (err) {
    startError.value = err.message || 'Failed to start.'
  } finally {
    starting.value = false
  }
}

async function handleDraw() {
  drawing.value = true
  drawError.value = null
  noTickets.value = false
  try {
    await store.drawWinner(props.eventId, props.raffleId)
  } catch (err) {
    if (err.message?.toLowerCase().includes('no tickets')) {
      noTickets.value = true
    } else {
      drawError.value = err.message || 'Failed to draw winner.'
    }
  } finally {
    drawing.value = false
  }
}

async function confirmDraw() {
  drawDialogOpen.value = false
  await handleDraw()
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

      <div class="p-6">
        <!-- Open state: Start button -->
        <div v-if="isOpen" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex-1">
            <p class="text-sm font-semibold text-gray-900">Ready to begin drawing?</p>
            <p class="text-xs text-gray-500 mt-1 max-w-sm">
              Lock all entries and transition the raffle into "Drawing" state when you are ready to pick winners.
            </p>
          </div>
          
          <button
            type="button"
            data-testid="raffle-start-btn"
            :disabled="starting"
            @click="handleStart"
            class="group relative inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md hover:shadow-lg overflow-hidden shrink-0"
          >
            <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none"></div>
            <svg v-if="starting" class="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            <span v-if="starting">Locking Entries…</span>
            <span v-else>Lock & Start Draw</span>
          </button>
        </div>
        <p v-if="startError" class="text-xs text-red-600 mt-2 font-medium">{{ startError }}</p>

        <!-- Drawing state: Draw + Present buttons -->
        <div v-if="isDrawing" class="space-y-4">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            
            <!-- Present button - Secondary action -->
            <button
              type="button"
              data-testid="raffle-present-btn"
              title="Show on a big screen"
              @click="router.push({ name: 'raffle-present', params: { id: eventId, raffleId } })"
              class="order-2 sm:order-1 flex-1 sm:flex-none inline-flex justify-center items-center gap-2 px-5 py-3 lg:px-6 lg:py-4 bg-white text-gray-700 text-sm font-bold uppercase tracking-wider rounded-xl border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm group"
            >
              <svg class="w-5 h-5 text-gray-400 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
              Presentation View
            </button>

            <!-- Draw button - Primary Action -->
            <button
              type="button"
              data-testid="raffle-draw-btn"
              :disabled="drawing || noTickets"
              @click="drawDialogOpen = true"
              class="order-1 sm:order-2 flex-[2] relative inline-flex justify-center items-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-base lg:text-lg font-black uppercase tracking-widest rounded-xl hover:from-emerald-400 hover:to-emerald-500 transition-all disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed shadow-lg hover:shadow-emerald-500/30 overflow-hidden transform active:scale-[0.98] group"
            >
              <!-- Decorative shine -->
              <div class="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:translate-x-[250%] transition-transform duration-1000"></div>
              
              <svg v-if="drawing" class="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
              </svg>
              <span v-if="drawing">Spinning…</span>
              <span v-else>Draw Winner</span>
            </button>
          </div>

          <!-- Draw contextual messages -->
          <div v-if="noTickets" class="flex gap-2 items-center rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-semibold">
            <svg class="w-5 h-5 text-amber-600 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            No tickets remaining in the pool. All possible winners have been drawn!
          </div>
          <p v-if="drawError" class="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{{ drawError }}</p>
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
           <!-- Rank indicator -->
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
    
    <div v-else-if="isDrawing" class="rounded-xl border border-dashed border-gray-200 p-8 text-center bg-gray-50/50">
      <div class="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
        <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
        </svg>
      </div>
      <p class="text-sm font-bold text-gray-700">No winners drawn yet</p>
      <p class="text-xs text-gray-500 mt-1">Press "Draw Winner" to pick the first lucky participant.</p>
    </div>
  </div>

  <ConfirmDialog
    :open="drawDialogOpen"
    title="Draw a winner?"
    message="This will pick a winner at random from the eligible entries. The draw cannot be undone."
    confirm-label="Draw winner"
    cancel-label="Cancel"
    variant="danger"
    @confirm="confirmDraw"
    @cancel="drawDialogOpen = false"
  />
</template>
