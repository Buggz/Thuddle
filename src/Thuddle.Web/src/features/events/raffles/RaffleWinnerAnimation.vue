<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import confetti from 'canvas-confetti'

const props = defineProps({
  winner: { type: Object, required: true },
  // { drawId, winnerUserId, displayName, ticketsBefore, ticketsAfter, drawnAt }
  entries: { type: Array, default: () => [] }
})

const emit = defineEmits(['revealed'])

// If entries are provided, use their names. If empty, use fallback generic names.
const baseNames = [
  { displayName: 'Alex?', profilePictureUrl: null },
  { displayName: 'Jordan?', profilePictureUrl: null },
  { displayName: 'Sam?', profilePictureUrl: null },
  { displayName: 'Pat?', profilePictureUrl: null },
  { displayName: 'Chris?', profilePictureUrl: null },
  { displayName: 'Taylor?', profilePictureUrl: null },
  { displayName: 'Casey?', profilePictureUrl: null },
  { displayName: 'Morgan?', profilePictureUrl: null },
  { displayName: 'Riley?', profilePictureUrl: null },
  { displayName: 'Drew?', profilePictureUrl: null }
]
const shuffleNames = computed(() => {
  if (props.entries?.length > 0) {
    // Include all participants in the shuffle for maximum suspense!
    return props.entries.map(e => ({
      displayName: e.displayName + '?',
      profilePictureUrl: e.profilePictureUrl
    }))
  }
  return baseNames
})

const currentDisplay = ref(shuffleNames.value[0])
const revealed = ref(false)

let shuffleInterval = null
let shuffleTimeout = null
let revealTimeout = null

function fireConfetti() {
  const end = Date.now() + 1500
  const frame = () => {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#6366f1', '#8b5cf6', '#ec4899'] })
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#f59e0b', '#10b981', '#3b82f6'] })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

onMounted(() => {
  let i = 0
  shuffleInterval = setInterval(() => {
    i++
    const items = shuffleNames.value
    currentDisplay.value = items[i % items.length]
  }, 120)

  shuffleTimeout = setTimeout(() => {
    clearInterval(shuffleInterval)
    currentDisplay.value = {
      displayName: props.winner.displayName,
      profilePictureUrl: props.winner.profilePictureUrl
    }
    revealed.value = true
    fireConfetti()
    revealTimeout = setTimeout(() => emit('revealed'), 2000)
  }, 3500)
})

onBeforeUnmount(() => {
  clearInterval(shuffleInterval)
  clearTimeout(shuffleTimeout)
  clearTimeout(revealTimeout)
})
</script>

<template>
  <div
    data-testid="raffle-winner-animation"
    class="flex flex-col items-center justify-center p-8 sm:px-12 sm:py-16 text-center max-w-3xl w-full"
  >
    <!-- Suspense / reveal label -->
    <div
      class="inline-block transition-all duration-700 transform"
      :class="revealed ? '-translate-y-4 scale-110' : 'translate-y-0 scale-100'"
    >
      <p class="text-sm font-black uppercase tracking-[0.25em] mb-6 transition-colors duration-500"
         :class="revealed ? 'text-emerald-400' : 'text-indigo-400 opacity-80'">
        {{ revealed ? '🎉 We Have a Winner!' : 'Scanning Entries...' }}
      </p>
    </div>

    <!-- Name display -->
    <div
      data-testid="raffle-winner-name"
      class="relative flex flex-col items-center gap-6 transition-all duration-500 ease-out z-10"
      :class="[
        revealed ? 'scale-100' : 'scale-95'
      ]"
    >
      <!-- Avatar -->
      <div 
        class="h-32 w-32 sm:h-40 sm:w-40 rounded-full overflow-hidden border-4 flex items-center justify-center bg-indigo-900 shadow-2xl transition-all duration-500"
        :class="revealed ? 'border-emerald-400 scale-110 shadow-emerald-400/20' : 'border-indigo-400 blur-[2px] opacity-80'"
      >
        <img v-if="currentDisplay.profilePictureUrl" :src="currentDisplay.profilePictureUrl" alt="" class="h-full w-full object-cover" />
        <span v-else class="text-5xl font-black text-indigo-300">{{ currentDisplay.displayName?.charAt(0).toUpperCase() || '?' }}</span>
      </div>

      <span class="text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white to-white transition-all duration-500"
            :class="revealed ? 'from-white to-gray-300 text-white' : 'from-indigo-200 to-indigo-400 text-indigo-200/40 blur-[1px]'">
        {{ currentDisplay.displayName }}
      </span>
      
      <!-- Glow effect behind text when revealed -->
      <div v-if="revealed" class="absolute inset-0 bg-indigo-500/20 blur-3xl -z-10 rounded-full animate-pulse"></div>
    </div>

    <!-- Ticket count after reveal -->
    <Transition name="fade-up">
      <div v-if="revealed" class="mt-8 flex flex-col items-center animate-fade-in-up">
        <div class="h-px w-16 bg-white/20 mb-4 rounded-full"></div>
        <p class="text-lg font-semibold text-indigo-200">
          <span class="text-white font-bold">{{ winner.ticketsAfter }}</span>
          ticket{{ winner.ticketsAfter === 1 ? '' : 's' }} remaining in the pool
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-up-enter-active {
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  transition-delay: 0.3s;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.fade-up-enter-to {
  opacity: 1;
  transform: translateY(0);
}
</style>
