<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRafflesStore } from '../stores/raffles'

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
  <div class="space-y-5">
    <!-- Open state: Start button -->
    <div v-if="isOpen" class="space-y-2">
      <p class="text-xs font-bold uppercase tracking-widest text-gray-400">Ready to draw?</p>
      <button
        type="button"
        data-testid="raffle-start-btn"
        :disabled="starting"
        @click="handleStart"
        class="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
        </svg>
        <span v-if="starting">Starting…</span>
        <span v-else>Start Draw</span>
      </button>
      <p v-if="startError" class="text-xs text-red-600">{{ startError }}</p>
    </div>

    <!-- Drawing state: Draw + Present buttons -->
    <div v-if="isDrawing" class="space-y-3">
      <div class="flex flex-wrap items-center gap-3">
        <!-- Draw button -->
        <button
          type="button"
          data-testid="raffle-draw-btn"
          :disabled="drawing"
          @click="handleDraw"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
          </svg>
          <span v-if="drawing">Drawing…</span>
          <span v-else>Draw Winner</span>
        </button>

        <!-- Present button -->
        <button
          type="button"
          data-testid="raffle-present-btn"
          title="Show on a big screen"
          @click="router.push({ name: 'raffle-present', params: { id: eventId, raffleId } })"
          class="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Present
        </button>
      </div>

      <!-- No tickets message -->
      <div v-if="noTickets" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
        No tickets remaining in the pool. All winners have been drawn.
      </div>

      <!-- Draw error -->
      <p v-if="drawError" class="text-xs text-red-600">{{ drawError }}</p>
    </div>

    <!-- Draw history -->
    <div v-if="draws.length" class="space-y-2">
      <p class="text-xs font-bold uppercase tracking-widest text-gray-400">Draw history</p>
      <ul data-testid="raffle-history-list" class="space-y-2">
        <li
          v-for="draw in draws"
          :key="draw.id"
          :data-testid="`raffle-history-row-${draw.id}`"
          class="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
        >
          <span class="text-lg" aria-hidden="true">🏆</span>
          <div class="flex-1 min-w-0">
            <span class="font-semibold text-gray-900 block truncate">{{ draw.displayName }}</span>
            <span class="text-xs text-gray-400">{{ formatDrawDate(draw.drawnAt) }}</span>
          </div>
          <span class="text-xs text-gray-400 shrink-0">
            {{ draw.ticketsAfter }} left
          </span>
        </li>
      </ul>
    </div>
    <div v-else-if="isDrawing">
      <p class="text-xs text-gray-400">No winners drawn yet.</p>
    </div>
  </div>
</template>
