<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRafflesStore } from '../stores/raffles'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { formatCurrency } from '@/shared/formatCurrency'
import RaffleWinnerAnimation from './RaffleWinnerAnimation.vue'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'

const props = defineProps({
  eventId: { type: String, required: true },
  raffleId: { type: String, required: true },
  raffle: { type: Object, required: true },
  currency: { type: String, default: '' }
})

const formattedPrice = computed(() =>
  formatCurrency(props.raffle?.pricePerTicket, props.currency)
)

const realtime = useRealtime()
const store = useRafflesStore()
const permissions = usePermissionsStore()

const entries = computed(() => store.entries.get(props.raffleId) ?? [])
const draws = computed(() => store.draws.get(props.raffleId) ?? [])

const canSelfReport = computed(() =>
  props.raffle?.selfReportingEnabled === true && props.raffle?.status === 'Open'
)

const myEntry = computed(() =>
  entries.value.find((e) => e.userId === permissions.userId)
)

const myTickets = computed(() => myEntry.value?.tickets ?? 0)

// Local draft for self-reporting input
const selfTickets = ref(myTickets.value)
watch(myTickets, (v) => { selfTickets.value = v })

const isDirty = computed(() => selfTickets.value !== myTickets.value)

const saving = ref(false)
const error = ref(null)
const success = ref(false)

// Real-time draw tracking
const latestDraw = ref(null)

const handleWinnerRevealed = (payload) => {
  if (payload.raffleId === props.raffleId) {
    latestDraw.value = payload
    // Fetch updated draws so the new winner appears in the list when they dismiss the animation
    store.fetchDraws(props.eventId, props.raffleId).catch(() => {})
  }
}

onMounted(() => {
  // Automatically show the animation on real-time broadcast of a draw
  realtime.on(RealtimeEvents.RaffleWinnerRevealed, handleWinnerRevealed)
  
  if (props.raffle?.drawCount > 0) {
    store.fetchDraws(props.eventId, props.raffleId).catch(() => {})
  }
})

onBeforeUnmount(() => {
  realtime.off(RealtimeEvents.RaffleWinnerRevealed, handleWinnerRevealed)
})

function dismissDraw() {
  latestDraw.value = null
}

async function save() {
  if (selfTickets.value < 0) selfTickets.value = 0
  saving.value = true
  error.value = null
  success.value = false
  try {
    await store.setEntryTickets(props.eventId, props.raffleId, permissions.userId, Number(selfTickets.value))
    success.value = true
    setTimeout(() => { success.value = false }, 2500)
  } catch (err) {
    error.value = err.message || 'Failed to save tickets.'
  } finally {
    saving.value = false
  }
}

function increment() {
  selfTickets.value = (selfTickets.value || 0) + 1
}

function decrement() {
  if (selfTickets.value > 0) selfTickets.value--
}
</script>

<template>
  <div class="relative overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm transition-all duration-300 hover:shadow-md">
    
    <!-- Live Winner Reveal Overlay -->
    <Transition
      enter-active-class="transition duration-500 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="latestDraw" data-testid="raffle-winner-reveal" class="fixed inset-0 z-[100] flex bg-indigo-950/95 text-white items-center justify-center p-4 backdrop-blur-sm shadow-xl overflow-hidden">
        <RaffleWinnerAnimation
          :winner="latestDraw"
          :entries="entries"
          @revealed="dismissDraw"
        />
        <button
          type="button"
          @click="dismissDraw"
          class="absolute top-6 right-6 text-white/50 hover:text-white transition-colors p-3 bg-white/10 rounded-full hover:bg-white/20"
          title="Dismiss"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </Transition>

    <!-- Left dashed line simulating a ticket stub -->
    <div class="absolute left-0 top-0 bottom-0 w-8 border-r-2 border-dashed border-indigo-100 bg-indigo-50/50 flex flex-col justify-between py-2">
      <!-- Decorative cutouts -->
      <div class="h-3 w-4 rounded-r-full bg-white -translate-x-1 border border-indigo-100 border-l-0"></div>
      <div class="h-3 w-4 rounded-r-full bg-white -translate-x-1 border border-indigo-100 border-l-0"></div>
      <div class="h-3 w-4 rounded-r-full bg-white -translate-x-1 border border-indigo-100 border-l-0"></div>
    </div>

    <!-- Description -->
    <div
      v-if="raffle.description?.trim()"
      data-testid="raffle-description"
      class="prose prose-sm max-w-none text-gray-700 pl-14 pr-6 pt-5"
      v-html="raffle.description"
    />

    <div class="pl-14 pr-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
      <!-- Left side: Status & Info -->
      <div class="flex flex-col">
        <span class="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-1">
          Your Entry
        </span>
        <div class="flex items-baseline gap-2">
          <span class="text-4xl font-extrabold text-gray-900 tracking-tight" :class="{'text-indigo-600': myTickets > 0}">
            {{ myTickets }}
          </span>
          <span class="text-sm font-semibold text-gray-400">ticket{{ myTickets === 1 ? '' : 's' }} left</span>
        </div>

        <div class="mt-1 flex items-center gap-2">
          <span v-if="raffle.pricePerTicket != null" data-testid="raffle-price-display" class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 font-bold border border-emerald-100">
            {{ formattedPrice }} / pt
          </span>
          <span v-else data-testid="raffle-price-display" class="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600 font-bold border border-gray-200">
            Free entry
          </span>
        </div>
      </div>

      <!-- Right side: Controls or messaging -->
      <div class="sm:text-right">
        <template v-if="canSelfReport">
          <div class="flex flex-col items-end gap-2">
            <div class="flex items-center rounded-xl bg-indigo-50 p-1 border border-indigo-200">
              <button
                type="button"
                @click="decrement"
                :disabled="saving"
                class="flex h-10 w-10 items-center justify-center rounded-lg text-indigo-600 hover:bg-white hover:text-indigo-800 disabled:opacity-50 transition-colors"
                aria-label="Decrease tickets"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
                </svg>
              </button>
              
              <input
                v-model.number="selfTickets"
                data-testid="raffle-self-tickets-input"
                type="number"
                min="0"
                class="w-16 bg-transparent text-center text-lg font-bold text-gray-900 focus:outline-none focus:ring-0 appearance-none"
                style="-moz-appearance: textfield;"
              />
              
              <button
                type="button"
                @click="increment"
                :disabled="saving"
                class="flex h-10 w-10 items-center justify-center rounded-lg text-indigo-600 hover:bg-white hover:text-indigo-800 disabled:opacity-50 transition-colors"
                aria-label="Increase tickets"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            <!-- Save button smoothly reveals when dirty (space preserved to prevent layout shift) -->
            <div
              class="w-full flex justify-end transition-all duration-200"
              :class="isDirty || saving ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1 pointer-events-none'"
            >
              <button
                type="button"
                data-testid="raffle-self-save-btn"
                :disabled="saving || (!isDirty && !saving)"
                :tabindex="isDirty || saving ? 0 : -1"
                @click="save"
                class="flex w-full sm:w-auto justify-center items-center rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 transition-all"
              >
                <svg v-if="saving" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span v-if="saving">Updating...</span>
                <span v-else>Update Tickets</span>
              </button>
            </div>
            
            <p v-if="error" class="text-xs text-red-600 font-medium">{{ error }}</p>
            <p v-if="success" class="text-xs text-emerald-600 font-bold transition-opacity duration-300">✓ Updated securely</p>
          </div>
        </template>

        <div v-else-if="raffle.status === 'Open' && !raffle.selfReportingEnabled" class="text-left sm:text-right">
          <p class="text-xs font-semibold text-gray-500 max-w-[200px] lead-snug">
            The event host manages entries for this raffle.
          </p>
        </div>

        <div v-else-if="raffle.status === 'Drawing'" class="text-left sm:text-right">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            Drawing in progress
          </span>
          <p class="mt-2 text-xs font-semibold text-gray-400">Entries are locked</p>
        </div>
      </div>
    </div>

    <!-- Winners List -->
    <div v-if="draws.length > 0" data-testid="raffle-participant-winners" class="border-t border-indigo-50 bg-indigo-50/50 px-6 py-4 pl-14 relative z-0">
      <h4 class="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-3 flex items-center gap-2">
        <svg class="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        Winners
      </h4>
      <div class="flex flex-wrap gap-2">
        <div v-for="draw in draws" :key="draw.id" :data-testid="`raffle-participant-winner-${draw.id}`" class="inline-flex items-center gap-2 rounded-full bg-white pr-3 pl-1 py-1 shadow-sm border border-indigo-100 transition-transform hover:scale-105">
          <div class="h-7 w-7 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden">
            <img v-if="draw.profilePictureUrl" :src="draw.profilePictureUrl" alt="" class="h-full w-full object-cover" />
            <span v-else class="text-xs font-bold text-indigo-700">{{ draw.displayName?.charAt(0).toUpperCase() || '?' }}</span>
          </div>
          <span class="text-sm font-semibold text-gray-900">{{ draw.displayName || 'Unknown' }}</span>
        </div>
      </div>
    </div>

  </div>
</template>
