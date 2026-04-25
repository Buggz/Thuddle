<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import confetti from 'canvas-confetti'

const props = defineProps({
  winner: { type: Object, required: true }
  // { drawId, winnerUserId, displayName, ticketsBefore, ticketsAfter, drawnAt }
})

const emit = defineEmits(['revealed'])

const SHUFFLE_NAMES = [
  'Alex?', 'Jordan?', 'Sam?', 'Pat?', 'Chris?',
  'Taylor?', 'Casey?', 'Morgan?', 'Riley?', 'Drew?',
  'Quinn?', 'Avery?', 'Blake?', 'Reese?', 'Skyler?'
]

const displayName = ref(SHUFFLE_NAMES[0])
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
    displayName.value = SHUFFLE_NAMES[i % SHUFFLE_NAMES.length]
  }, 120)

  shuffleTimeout = setTimeout(() => {
    clearInterval(shuffleInterval)
    displayName.value = props.winner.displayName
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
      class="relative text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tighter transition-all duration-500 ease-out z-10"
      :class="[
        revealed ? 'text-white scale-100' : 'text-indigo-200/40 scale-95 blur-[1px]'
      ]"
    >
      <span class="bg-clip-text text-transparent bg-gradient-to-br from-white to-white"
            :class="revealed ? 'from-white to-gray-300' : 'from-indigo-200 to-indigo-400'">
        {{ displayName }}
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
