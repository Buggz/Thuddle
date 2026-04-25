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
  <!-- Fullscreen Cinematic Overlay -->
  <div
    data-testid="raffle-present-view"
    class="fixed inset-0 z-[9999] flex flex-col bg-[#050511] text-white overflow-hidden font-sans"
  >
    <!-- Deep Ambient Glows -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-indigo-600/10 blur-[150px]"></div>
      <div class="absolute top-[40%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-purple-600/10 blur-[120px]"></div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex flex-col items-center justify-center relative z-10">
      <div class="flex gap-2 items-center text-indigo-300">
        <svg class="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-2xl font-bold tracking-widest uppercase ml-4">Loading Stage…</span>
      </div>
    </div>

    <template v-else>
      <!-- Winner animation overlay -->
      <Transition name="reveal">
        <div
          v-if="pendingReveal"
          class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xl"
        >
          <RaffleWinnerAnimation
            :winner="pendingReveal"
            :entries="store.entries.get(raffleId)"
            @revealed="handleRevealed"
          />
        </div>
      </Transition>

      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10">
        <!-- Main Stage -->
        <div class="flex-1 flex flex-col justify-center p-8 sm:p-12 lg:p-24 relative">
          
          <div class="max-w-5xl mx-auto w-full text-center space-y-12">
            <!-- Badges -->
            <div class="flex flex-wrap items-center justify-center gap-4">
              <span class="px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-[0.25em] border border-white/20 bg-white/5 backdrop-blur-md shadow-lg text-white">
                Live Raffle Stage
              </span>
              <span
                class="px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-[0.25em] shadow-lg border backdrop-blur-md"
                :class="isDrawing 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'"
              >
                <div v-if="isDrawing" class="flex items-center gap-2">
                  <span class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Drawing Now
                </div>
                <span v-else>Locked & Ready</span>
              </span>
            </div>

            <!-- Title -->
            <h1
              data-testid="raffle-present-name"
              class="text-6xl sm:text-7xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-indigo-50 to-indigo-300 tracking-tight leading-[1.1] drop-shadow-sm pb-2"
            >
              {{ raffle?.name ?? '…' }}
            </h1>

            <!-- Audience Stats -->
            <div class="flex flex-wrap justify-center items-center gap-8 sm:gap-16 pt-4">
              <div class="text-center px-8">
                <p class="text-5xl lg:text-7xl font-black text-indigo-400 tabular-nums tracking-tighter">{{ raffle?.entryCount ?? 0 }}</p>
                <p class="text-sm font-bold uppercase tracking-[0.2em] text-white/50 mt-3">Participants</p>
              </div>
              <div class="w-px h-20 bg-white/10 hidden sm:block"></div>
              <div class="text-center px-8">
                <p class="text-5xl lg:text-7xl font-black text-purple-400 tabular-nums tracking-tighter">{{ raffle?.totalTickets ?? 0 }}</p>
                <p class="text-sm font-bold uppercase tracking-[0.2em] text-white/50 mt-3">Tickets in Pool</p>
              </div>
            </div>

            <!-- The Big Button (Host Only) -->
            <div v-if="isHost && isDrawing" class="pt-12">
              <button
                type="button"
                data-testid="raffle-present-draw-btn"
                :disabled="drawing || noTickets"
                @click="handleDraw"
                class="group relative inline-flex items-center justify-center gap-4 px-12 py-6 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-3xl hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-[0_0_60px_-15px_rgba(16,185,129,0.4)] hover:shadow-[0_0_100px_-15px_rgba(16,185,129,0.7)] hover:scale-[1.02] disabled:opacity-50 disabled:grayscale disabled:hover:scale-100 disabled:shadow-none overflow-hidden"
              >
                <!-- Cinematic sweep -->
                <div class="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:translate-x-[250%] transition-transform duration-1000"></div>
                
                <svg v-if="drawing" class="animate-spin w-10 h-10 text-white/90" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <svg v-else class="w-10 h-10 text-white/90" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.49 4.49 0 00-1.757 4.306 4.438 4.438 0 002.946-2.946 4.49 4.49 0 00-1.189-1.36g0z" />
                </svg>

                <span class="text-3xl sm:text-4xl font-black uppercase tracking-widest leading-none">
                  {{ drawing ? 'Spinning…' : 'Draw Winner' }}
                </span>
              </button>
              
              <div v-if="noTickets" class="mt-8">
                <span class="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full text-lg font-bold">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  All winners have been drawn!
                </span>
              </div>
              <p v-if="drawError" class="mt-8 text-xl font-bold text-red-400">{{ drawError }}</p>
            </div>
            
            <!-- Description -->
            <div v-if="raffle?.description" class="pt-8">
               <div class="prose prose-invert prose-lg lg:prose-xl mx-auto text-white/60" v-html="raffle.description"></div>
            </div>
          </div>

          <!-- Bottom Left: Exit presentation -->
          <div class="absolute bottom-6 left-6 sm:bottom-10 sm:left-10">
            <button
              type="button"
              @click="exit"
              class="flex items-center gap-3 px-5 py-3 text-sm font-black uppercase tracking-widest text-white/30 hover:text-white border border-white/10 rounded-full hover:bg-white/10 transition-all backdrop-blur-md"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Exit
            </button>
          </div>
        </div>

        <!-- Right Sidebar: Winners Board -->
        <div class="w-full lg:w-[440px] xl:w-[500px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/40 backdrop-blur-2xl flex flex-col relative z-20">
          <div class="px-8 py-8 border-b border-white/10 bg-white/5">
            <h2 class="text-2xl font-black uppercase tracking-[0.2em] text-white">Winners Board</h2>
          </div>
          
          <div class="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
            <div v-if="!draws.length" class="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-30 pb-20">
              <svg class="w-24 h-24" fill="none" stroke="currentColor" stroke-width="1" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
              </svg>
              <p class="font-bold text-lg uppercase tracking-widest">Awaiting First Draw</p>
            </div>

            <ul v-else class="space-y-5">
              <li
                v-for="(draw, idx) in draws"
                :key="draw.id"
                class="relative p-6 sm:p-8 rounded-3xl overflow-hidden group transition-all"
                :class="idx === 0 
                  ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border-2 border-indigo-400/50 shadow-2xl shadow-indigo-900/30' 
                  : 'bg-white/5 border border-white/10 hover:border-white/20'"
              >
                <!-- Latest / Highlight flag -->
                <div v-if="idx === 0" class="absolute top-0 right-0 px-4 py-1.5 bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-bl-2xl">
                  Latest
                </div>
                
                <div class="flex flex-col h-full">
                  <p class="text-sm font-bold uppercase tracking-[0.2em] mb-2" :class="idx === 0 ? 'text-indigo-300' : 'text-white/40'">
                    Winner #{{ draws.length - idx }}
                  </p>
                  <p class="font-black text-white truncate drop-shadow-md pb-6" :class="idx === 0 ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'">
                    {{ draw.displayName }}
                  </p>
                  
                  <div class="flex items-center justify-between border-t mt-auto pt-5" :class="idx === 0 ? 'border-indigo-400/30' : 'border-white/10'">
                    <span class="text-sm font-medium text-white/50">{{ formatDate(draw.drawnAt) }}</span>
                    <span class="text-sm font-black px-3 py-1.5 rounded-lg bg-black/40" :class="idx === 0 ? 'text-indigo-200' : 'text-white/60'">
                      {{ draw.ticketsAfter }} left
                    </span>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reveal-enter-active,
.reveal-leave-active { transition: opacity 0.4s ease; }
.reveal-enter-from,
.reveal-leave-to { opacity: 0; }

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>
