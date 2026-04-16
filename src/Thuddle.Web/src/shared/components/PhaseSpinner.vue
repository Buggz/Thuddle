<script setup>
import { shallowRef, onMounted, onUnmounted } from 'vue'

defineProps({
  size: { type: String, default: 'md' },
})

const phase = shallowRef(0)
const totalPhases = 3
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    phase.value = (phase.value + 1) % totalPhases
  }, 2400)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div
    class="phase-spinner"
    :class="[
      `phase-spinner--${size}`,
      `phase-spinner--phase-${phase}`,
    ]"
    role="status"
    aria-label="Loading"
  >
    <!-- Phase 0: Counter-rotating rings -->
    <div class="phase-spinner__rings" :class="{ active: phase === 0 }">
      <div class="phase-spinner__ring phase-spinner__ring--outer" />
      <div class="phase-spinner__ring phase-spinner__ring--inner" />
    </div>

    <!-- Phase 1: Morphing dots orbiting -->
    <div class="phase-spinner__orbit" :class="{ active: phase === 1 }">
      <div class="phase-spinner__dot phase-spinner__dot--1" />
      <div class="phase-spinner__dot phase-spinner__dot--2" />
      <div class="phase-spinner__dot phase-spinner__dot--3" />
    </div>

    <!-- Phase 2: Pulsing concentric rings -->
    <div class="phase-spinner__pulse" :class="{ active: phase === 2 }">
      <div class="phase-spinner__pulse-ring phase-spinner__pulse-ring--1" />
      <div class="phase-spinner__pulse-ring phase-spinner__pulse-ring--2" />
      <div class="phase-spinner__pulse-ring phase-spinner__pulse-ring--3" />
    </div>
  </div>
</template>

<style scoped>
.phase-spinner {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.phase-spinner--sm { width: 2rem; height: 2rem; }
.phase-spinner--md { width: 3.5rem; height: 3.5rem; }
.phase-spinner--lg { width: 5rem; height: 5rem; }

/* Shared phase container behaviour */
.phase-spinner__rings,
.phase-spinner__orbit,
.phase-spinner__pulse {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.4s ease, transform 0.4s ease;
  pointer-events: none;
}

.phase-spinner__rings.active,
.phase-spinner__orbit.active,
.phase-spinner__pulse.active {
  opacity: 1;
  transform: scale(1);
}

/* ── Phase 0: Counter-rotating rings ── */
.phase-spinner__ring {
  position: absolute;
  border-radius: 50%;
  border: 2.5px solid transparent;
}

.phase-spinner__ring--outer {
  width: 100%;
  height: 100%;
  border-top-color: #6366f1;
  border-right-color: #6366f1;
  animation: spin-outer 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.phase-spinner__ring--inner {
  width: 60%;
  height: 60%;
  border-bottom-color: #a78bfa;
  border-left-color: #a78bfa;
  animation: spin-inner 0.9s cubic-bezier(0.6, 0, 0.4, 1) infinite;
}

@keyframes spin-outer {
  0%   { transform: rotate(0deg); }
  50%  { transform: rotate(220deg); }
  100% { transform: rotate(360deg); }
}

@keyframes spin-inner {
  0%   { transform: rotate(0deg); }
  50%  { transform: rotate(-200deg); }
  100% { transform: rotate(-360deg); }
}

/* ── Phase 1: Orbiting dots ── */
.phase-spinner__dot {
  position: absolute;
  width: 18%;
  height: 18%;
  border-radius: 50%;
  background: #6366f1;
}

.phase-spinner__dot--1 {
  animation: orbit-dot 1.6s ease-in-out infinite;
  animation-delay: 0s;
}

.phase-spinner__dot--2 {
  animation: orbit-dot 1.6s ease-in-out infinite;
  animation-delay: -0.533s;
  background: #818cf8;
}

.phase-spinner__dot--3 {
  animation: orbit-dot 1.6s ease-in-out infinite;
  animation-delay: -1.066s;
  background: #a78bfa;
}

@keyframes orbit-dot {
  0%   { transform: rotate(0deg) translateX(140%) scale(1); opacity: 1; }
  25%  { transform: rotate(90deg) translateX(140%) scale(0.6); opacity: 0.6; }
  50%  { transform: rotate(180deg) translateX(140%) scale(1); opacity: 1; }
  75%  { transform: rotate(270deg) translateX(140%) scale(0.6); opacity: 0.6; }
  100% { transform: rotate(360deg) translateX(140%) scale(1); opacity: 1; }
}

/* ── Phase 2: Pulsing concentric rings ── */
.phase-spinner__pulse-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid #6366f1;
  animation: pulse-ring 1.8s ease-out infinite;
}

.phase-spinner__pulse-ring--1 {
  width: 30%;
  height: 30%;
  animation-delay: 0s;
}

.phase-spinner__pulse-ring--2 {
  width: 30%;
  height: 30%;
  animation-delay: 0.6s;
}

.phase-spinner__pulse-ring--3 {
  width: 30%;
  height: 30%;
  animation-delay: 1.2s;
}

@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.8;
    border-color: #6366f1;
  }
  70% {
    transform: scale(3);
    opacity: 0;
    border-color: #a78bfa;
  }
  100% {
    transform: scale(3);
    opacity: 0;
  }
}
</style>
