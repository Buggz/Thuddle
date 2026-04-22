import { ref, onUnmounted } from 'vue'

/**
 * Server-time-aware clock.
 *
 * Computes drift = (server now − client now) on each `sync()` call so that
 * `now()` always returns "what time the server thinks it is, right now".
 *
 * The reactive `tick` ref is bumped on each animation frame; templates that
 * depend on `tick.value` will recompute every frame so countdowns glide
 * smoothly. Stops the rAF loop on unmount.
 */
export function useServerClock(initialServerTime) {
  let drift = 0
  if (initialServerTime) sync(initialServerTime)

  const tick = ref(0)
  let rafId = null
  let mounted = true

  function loop() {
    if (!mounted) return
    tick.value = (tick.value + 1) & 0x7fffffff
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)

  function now() {
    return Date.now() + drift
  }

  function sync(serverIsoOrDate) {
    const serverMs = serverIsoOrDate instanceof Date
      ? serverIsoOrDate.getTime()
      : Date.parse(serverIsoOrDate)
    if (Number.isFinite(serverMs)) {
      drift = serverMs - Date.now()
    }
  }

  onUnmounted(() => {
    mounted = false
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return { now, sync, tick }
}
