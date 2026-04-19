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
  status: { type: String, default: 'Live' },
  showTotalDuration: { type: Boolean, default: false },
  bidTimeExtensionSeconds: { type: Number, default: 0 }
})

const EXTENSION_PCT = 8

const hasExtension = computed(() => props.bidTimeExtensionSeconds > 0)
const barScale = computed(() => hasExtension.value ? (100 - EXTENSION_PCT) / 100 : 1)

const clock = props.showTotalDuration ? null : useServerClock(props.serverTime)

watch(() => props.serverTime, (val) => {
  if (val && clock) clock.sync(val)
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
  if (!clock) return 0
  // eslint-disable-next-line no-unused-expressions
  clock.tick.value
  return clock.now()
})

const certainPct = computed(() => {
  const certain = Math.max(0, earliestMs.value - startMs.value)
  const rawCertain = Math.min(100, (certain / totalMs.value) * 100)
  if (veilMs.value > 0) {
    const rawVeil = Math.min(100 - rawCertain, (veilMs.value / totalMs.value) * 100)
    const MIN_VEIL_PCT = 5
    if (rawVeil < MIN_VEIL_PCT) {
      return Math.max(0, 100 - MIN_VEIL_PCT)
    }
  }
  return rawCertain
})

const effectiveVeilPct = computed(() => {
  if (veilMs.value <= 0) return 0
  const rawVeil = Math.min(100, (veilMs.value / totalMs.value) * 100)
  const MIN_VEIL_PCT = 5
  return Math.max(rawVeil, MIN_VEIL_PCT)
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
  const pad = (n) => String(n).padStart(2, '0')
  if (totalSec >= 86400) {
    const d = Math.floor(totalSec / 86400)
    const h = Math.floor((totalSec % 86400) / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    return `${d}d ${pad(h)}h ${pad(m)}m`
  }
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

const labelText = computed(() => {
  if (props.showTotalDuration) return `Total: ${fmtDuration(totalMs.value)}`
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
    <div class="relative h-10 w-full overflow-hidden rounded-full bg-gray-100">
      <!-- Certain segment -->
      <div
        class="absolute inset-y-0 left-0 bg-emerald-500/80 transition-[width] duration-500"
        :style="{ width: (certainPct * barScale) + '%' }"
      />
      <!-- Veil segment -->
      <div
        v-if="veilMs > 0"
        class="absolute inset-y-0 transition-[width] duration-500"
        :class="veilActive ? 'veil-active bg-rose-500/80' : 'bg-amber-400/70'"
        :style="{ left: (certainPct * barScale) + '%', width: (effectiveVeilPct * barScale) + '%' }"
      />
      <div
        v-if="hasExtension"
        class="extension-stripes absolute inset-y-0 flex items-center justify-center transition-[left] duration-500"
        :style="{ left: (100 - EXTENSION_PCT) + '%', width: EXTENSION_PCT + '%' }"
      >
        <span class="text-sm font-extrabold text-gray-500 drop-shadow-sm">?</span>
      </div>
      <!-- Now marker -->
      <div
        v-if="!showTotalDuration"
        class="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-gray-900 shadow-[0_0_0_2px_rgba(255,255,255,0.85)] transition-[left] duration-300"
        :style="{ left: `calc(${markerPct * barScale}% - 1px)` }"
        aria-hidden="true"
      />
      <p
        data-testid="auction-time-remaining-text"
        aria-live="polite"
        class="timeline-label absolute inset-0 flex items-center justify-center text-sm font-bold text-white tabular-nums"
      >
        {{ labelText }}
      </p>
    </div>
    <p v-if="veilMs > 0" class="mt-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
      Veiled close
    </p>
  </div>
</template>

<style scoped>
.timeline-label {
  text-shadow: 0 1px 4px rgba(0,0,0,0.6), 0 0 10px rgba(0,0,0,0.3);
}
.veil-active {
  animation: veil-pulse 1.4s ease-in-out infinite;
}
@keyframes veil-pulse {
  0%, 100% { opacity: 0.85; box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.45); }
  50% { opacity: 1; box-shadow: 0 0 0 4px rgba(244, 63, 94, 0); }
}
.extension-stripes {
  background: repeating-linear-gradient(
    -45deg,
    rgb(209 213 219 / 0.5),
    rgb(209 213 219 / 0.5) 3px,
    rgb(229 231 235 / 0.5) 3px,
    rgb(229 231 235 / 0.5) 6px
  );
}
</style>
