<script setup>
import { shallowRef, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  title: { type: String, default: 'Loading...' },
  delay: { type: Number, default: 2500 },
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
  <div class="flex flex-col items-center gap-2">
    <p class="text-gray-600 font-semibold text-lg">{{ title }}</p>
    <p class="text-gray-500 text-base transition-opacity duration-300">{{ currentMessage }}...</p>
  </div>
</template>
