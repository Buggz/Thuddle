<script setup>
import { shallowRef, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  title: { type: String, default: 'Loading...' },
  delay: { type: Number, default: 2500 },
  showSpinner: { type: Boolean, default: true },
})

const messages = [
  'Constructing additional pylons',
  'Feeding the pigeons',
  'Adding hamsters to wheel',
  'Reticulating splines',
  'Convincing electrons to cooperate',
  'Bribing the server hamsters',
  'Untangling the internet cables',
  'Polishing the pixels',
  'Teaching the database to read',
  'Warming up the flux capacitor',
  'Calibrating the cloud',
  'Herding cats',
  'Consulting the magic 8-ball',
  'Downloading more RAM',
  'Inflating the cloud',
  'Charging the laser sharks',
  'Tuning the hyperdrives',
  'Rolling for initiative',
  'Summoning the data elves',
  'Shaking the binary tree',
  'Negotiating with the load balancer',
  'Spinning up the hamster wheels',
  'Aligning the magnetic north',
  'Compiling the vibes',
  'Defragmenting the internet',
  'Brewing digital coffee',
  'Waking up the microservices',
  'Asking the cloud nicely',
  'Recalibrating the warp drive',
  'Flipping all the right bits',
  'Poking the DNS resolver',
  'Rounding up stray packets',
  'Greasing the API gears',
  'Counting backwards from infinity',
  'Locating the any key',
  'Reversing the polarity',
  'Adjusting for time dilation',
  'Soothing the angry electrons',
  'Waiting for the stars to align',
  'Teaching pigeons to carry data',
]

const currentMessage = shallowRef('')
let timer = null
let lastIndex = -1

function pickMessage() {
  let idx
  do { idx = Math.floor(Math.random() * messages.length) } while (idx === lastIndex && messages.length > 1)
  lastIndex = idx
  currentMessage.value = messages[idx]
}

onMounted(() => {
  pickMessage()
  timer = setInterval(pickMessage, props.delay)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="flex flex-col items-center justify-center w-full">
    <div v-if="showSpinner" class="relative flex items-center justify-center w-14 h-14 mb-6 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl border border-slate-200/60 shadow-sm">
      <svg class="w-6 h-6 text-indigo-500 animate-[spin_1.5s_linear_infinite] opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M12 3v3m6.364-.364l-2.121 2.121M21 12h-3m.364 6.364l-2.121-2.121M12 21v-3m-6.364.364l2.121-2.121M3 12h3m-.364-6.364l2.121 2.121" />
      </svg>
    </div>
    <div class="text-center space-y-1.5 flex flex-col items-center">
      <h3 class="text-[14px] font-bold text-slate-800 tracking-tight">{{ title }}</h3>
      <div class="h-6 flex items-center justify-center overflow-hidden">
        <Transition name="fade" mode="out-in">
          <p :key="currentMessage" class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center">
            {{ currentMessage }}
            <span class="flex w-3 ml-0.5 text-slate-300">
              <span class="animate-[bounce_1.4s_infinite_0ms]">.</span>
              <span class="animate-[bounce_1.4s_infinite_200ms]">.</span>
              <span class="animate-[bounce_1.4s_infinite_400ms]">.</span>
            </span>
          </p>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
