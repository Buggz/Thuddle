<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRafflesStore } from '../stores/raffles'
import { useEventsStore } from '@/features/events/stores/events'
import RaffleWinnerAnimation from './RaffleWinnerAnimation.vue'

const route = useRoute()
const router = useRouter()
const store = useRafflesStore()
const eventsStore = useEventsStore()

const eventId = route.params.id
const raffleId = route.params.raffleId

const loading = ref(true)
const drawing = ref(false)
const drawError = ref(null)
const noTickets = ref(false)

const raffle = computed(() => store.raffles.get(raffleId))
const draws = computed(() => store.draws.get(raffleId) ?? [])
const pendingReveal = computed(() => store.pendingReveal.get(raffleId) ?? null)

const event = computed(() => eventsStore.byId[eventId] ?? null)
const isHost = computed(() => event.value?.isAdmin ?? false)
const isDrawing = computed(() => raffle.value?.status === 'Drawing')

async function load() {
  loading.value = true
  store.consumeReveal(raffleId)
  
  try {
    store.installRealtime()
    await Promise.all([
      store.fetchRaffle(eventId, raffleId),
      store.fetchDraws(eventId, raffleId)
    ])
    if (!eventsStore.byId[eventId]) {
      await eventsStore.loadEvent(eventId)
    }
  } catch { /* render what we have */ }
  finally { loading.value = false }
}

async function handleDraw() {
  drawing.value = true
  drawError.value = null
  noTickets.value = false
  try {
    await store.drawWinner(eventId, raffleId)
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

function handleRevealed() {
  store.consumeReveal(raffleId)
}

function exit() {
  router.push({ name: 'event', params: { id: eventId } })
}

function handleKeydown(e) {
  if (e.key === 'Escape') exit()
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(() => {
  load()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <!-- Fullscreen overlay — covers navbar via fixed positioning -->
  <div
    data-testid="raffle-present-view"
    class="fixed inset-0 z-[9999] flex flex-col bg-gradient-to-br from-indigo-950 via-purple-950 to-slate-950 text-white overflow-hidden"
  >
    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <div class="text-indigo-300 animate-pulse text-lg font-semibold">Loading…</div>
    </div>

    <template v-else>
      <!-- Winner animation overlay -->
      <Transition name="reveal">
        <div
          v-if="pendingReveal"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"
        >
          <RaffleWinnerAnimation
            :winner="pendingReveal"
            :entries="store.entries.get(raffleId)"
            @revealed="handleRevealed"
          />
        </div>
      </Transition>

      <!-- Header bar -->
      <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10">
        <!-- Raffle name -->
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-0.5">Raffle</p>
          <h1
            data-testid="raffle-present-name"
            class="text-2xl sm:text-3xl font-extrabold text-white truncate"
          >
            {{ raffle?.name ?? '…' }}
          </h1>
        </div>

        <!-- Status badge -->
        <div class="shrink-0 ml-4 flex items-center gap-3">
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            :class="isDrawing
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'"
          >
            {{ raffle?.status ?? '…' }}
          </span>
        </div>
      </div>

      <!-- Main content area -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <!-- Left: Description + Draw controls -->
        <div class="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
          <!-- Description -->
          <div
            v-if="raffle?.description"
            class="prose prose-invert prose-sm max-w-none"
            v-html="raffle.description"
          />

          <!-- Host draw controls -->
          <div v-if="isHost && isDrawing" class="space-y-3">
            <button
              type="button"
              data-testid="raffle-present-draw-btn"
              :disabled="drawing"
              @click="handleDraw"
              class="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white font-bold rounded-2xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-900/40 disabled:opacity-60 disabled:cursor-not-allowed text-base"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
              </svg>
              <span v-if="drawing">Drawing…</span>
              <span v-else>Draw Winner</span>
            </button>

            <!-- No tickets message -->
            <p
              v-if="noTickets"
              data-testid="raffle-no-tickets-msg"
              class="text-sm text-amber-300 font-semibold"
            >
              No tickets remaining — all winners have been drawn!
            </p>
            <p v-if="drawError" class="text-sm text-red-400">{{ drawError }}</p>
          </div>
        </div>

        <!-- Right: Winners list -->
        <div class="lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col overflow-hidden">
          <div class="px-5 py-4 border-b border-white/10">
            <p class="text-xs font-bold uppercase tracking-widest text-indigo-300">Winners</p>
          </div>

          <div class="flex-1 overflow-y-auto p-4">
            <div
              v-if="!draws.length"
              class="text-sm text-indigo-300/60 text-center py-8"
            >
              No winners yet
            </div>

            <ul
              v-else
              data-testid="raffle-winners-list"
              class="space-y-2"
            >
              <li
                v-for="draw in draws"
                :key="draw.id"
                :data-testid="`raffle-winners-row-${draw.id}`"
                class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5"
              >
                <span class="text-xl" aria-hidden="true">🏆</span>
                <div class="flex-1 min-w-0">
                  <span class="block font-bold text-white text-sm truncate">{{ draw.displayName }}</span>
                  <span class="text-xs text-indigo-300">{{ formatDate(draw.drawnAt) }}</span>
                </div>
                <span class="text-xs text-indigo-300/60 shrink-0">
                  {{ draw.ticketsAfter }} left
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Footer: Exit button -->
      <div class="shrink-0 flex items-center justify-end px-6 py-4 border-t border-white/10">
        <button
          type="button"
          data-testid="raffle-present-exit-btn"
          @click="exit"
          class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white border border-white/20 rounded-xl hover:bg-white/10 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          Exit Presentation
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reveal-enter-active,
.reveal-leave-active { transition: opacity 0.3s ease; }
.reveal-enter-from,
.reveal-leave-to { opacity: 0; }
</style>
