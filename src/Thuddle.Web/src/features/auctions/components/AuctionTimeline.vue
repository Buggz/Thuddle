<script setup>
import { computed, watch } from 'vue'
import { useServerClock } from '@/features/auctions/composables/useServerClock'

/**
 * The headline graphic for an auction item: a bar that shows how much certain
 * time remains, then the veiled close window where the auction may end at any
 * moment.
 *
 * Order, method, and a "now" marker that glides — Poirot would have it no
 * other way.
 */
const props = defineProps({
  startsAt: { type: String, required: true },
  latestEndsAt: { type: String, required: true },
  earliestEndsAt: { type: String, default: null },
  veiledCloseWindowSeconds: { type: Number, default: 0 },
  serverTime: { type: String, default: null },
  status: { type: String, default: 'Live' }
})

const clock = useServerClock(props.serverTime)

watch(() => props.serverTime, (val) => {
  if (val) clock.sync(val)
})

const startMs = computed(() => Date.parse(props.startsAt))
const latestMs = computed(() => Date.parse(props.latestEndsAt))
const earliestMs = computed(() => {
  if (props.earliestEndsAt) return Date.parse(props.earliestEndsAt)
  return latestMs.value - (props.veiledCloseWindowSeconds * 1000)
})
const totalMs = computed(() => Math.max(latestMs.value - startMs.value, 1))
const veilMs = computed(() => Math.max(latestMs.value - earliestMs.value, 0))

// `tick` is read so the computed re-runs every animation frame.
const nowMs = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  clock.tick.value
  return clock.now()
})

const certainPct = computed(() => {
  const certain = Math.max(0, earliestMs.value - startMs.value)
  return Math.min(100, (certain / totalMs.value) * 100)
})

const veilPct = computed(() => {
  return Math.min(100 - certainPct.value, (veilMs.value / totalMs.value) * 100)
})

const markerPct = computed(() => {
  const elapsed = nowMs.value - startMs.value
  const pct = (elapsed / totalMs.value) * 100
  return Math.max(0, Math.min(100, pct))
})

const veilActive = computed(() =>
  veilMs.value > 0 && nowMs.value >= earliestMs.value && nowMs.value <= latestMs.value
)

const ended = computed(() => nowMs.value > latestMs.value)

function fmtDuration(ms) {
  if (ms <= 0) return '00:00:00'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

const labelText = computed(() => {
  if (props.status === 'Ended' || ended.value) return 'Auction has ended'
  if (props.status === 'Scheduled') {
    const toStart = startMs.value - nowMs.value
    return `Starts in ${fmtDuration(toStart)}`
  }
  if (veilMs.value === 0) {
    return `${fmtDuration(latestMs.value - nowMs.value)} to close`
  }
  if (veilActive.value) {
    return `Veiled close in effect — could end any moment (≤ ${fmtDuration(latestMs.value - nowMs.value)})`
  }
  const toEarliest = earliestMs.value - nowMs.value
  return `${fmtDuration(toEarliest)} left (then up to ${fmtDuration(veilMs.value)} veiled window)`
})
</script>

<template>
  <div
    data-testid="auction-timeline"
    class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    :data-veil-active="veilActive ? 'true' : 'false'"
  >
    <div class="relative h-3 w-full overflow-hidden rounded-full bg-gray-100">
      <!-- Certain segment -->
      <div
        class="absolute inset-y-0 left-0 bg-emerald-500/80 transition-[width] duration-500"
        :style="{ width: certainPct + '%' }"
      />
      <!-- Veil segment -->
      <div
        v-if="veilMs > 0"
        class="absolute inset-y-0 transition-[width] duration-500"
        :class="veilActive ? 'veil-active bg-rose-500/80' : 'bg-amber-400/70'"
        :style="{ left: certainPct + '%', width: veilPct + '%' }"
      />
      <!-- Now marker -->
      <div
        class="absolute -top-1 h-5 w-0.5 rounded-full bg-gray-900 shadow-[0_0_0_2px_rgba(255,255,255,0.85)] transition-[left] duration-300"
        :style="{ left: `calc(${markerPct}% - 1px)` }"
        aria-hidden="true"
      />
    </div>
    <div class="mt-3 flex items-baseline justify-between gap-3">
      <p
        data-testid="auction-time-remaining-text"
        aria-live="polite"
        class="text-sm font-bold text-gray-900 tabular-nums"
        :class="veilActive ? 'text-rose-700' : ''"
      >
        {{ labelText }}
      </p>
      <p v-if="veilMs > 0" class="text-[11px] font-bold uppercase tracking-widest text-gray-400">
        Veiled close
      </p>
    </div>
  </div>
</template>

<style scoped>
.veil-active {
  animation: veil-pulse 1.4s ease-in-out infinite;
}
@keyframes veil-pulse {
  0%, 100% { opacity: 0.85; box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.45); }
  50% { opacity: 1; box-shadow: 0 0 0 4px rgba(244, 63, 94, 0); }
}
</style>
