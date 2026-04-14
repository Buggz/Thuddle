<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Spinner from '@/shared/components/Spinner.vue'

const props = defineProps({
  imageFile: { type: File, required: true }
})

const emit = defineEmits(['crop', 'cancel'])

const imgEl = ref(null)
const canvasEl = ref(null)

const imageUrl = ref(null)
const loaded = ref(false)

const natW = ref(0)
const natH = ref(0)
const dispW = ref(0)
const dispH = ref(0)

const cx = ref(0)
const cy = ref(0)
const cr = ref(0)

const mode = ref(null)
const startPointer = ref({ x: 0, y: 0 })
const startCircle = ref({ x: 0, y: 0, r: 0 })
const cursorStyle = ref('default')

const rotation = ref(0)

const EDGE_HIT = 14
const MIN_RADIUS = 20

onMounted(() => {
  imageUrl.value = URL.createObjectURL(props.imageFile)
})

onBeforeUnmount(() => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  removeWindowListeners()
})

function onImageLoad() {
  const img = imgEl.value
  natW.value = img.naturalWidth
  natH.value = img.naturalHeight

  // Make element visible first, then measure display size
  loaded.value = true
  nextTick(() => {
    dispW.value = img.clientWidth
    dispH.value = img.clientHeight

    const minDim = Math.min(dispW.value, dispH.value)
    cr.value = Math.floor(minDim * 0.4)
    cx.value = Math.floor(dispW.value / 2)
    cy.value = Math.floor(dispH.value / 2)

    nextTick(drawOverlay)
  })
}

function onImageError() {
  emit('cancel')
}

function drawOverlay() {
  const c = canvasEl.value
  if (!c) return
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(0, 0, c.width, c.height)

  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(cx.value, cy.value, cr.value, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx.value, cy.value, cr.value, 0, Math.PI * 2)
  ctx.stroke()
}

function pointerPos(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  const touch = e.touches?.[0]
  return {
    x: (touch?.clientX ?? e.clientX) - rect.left,
    y: (touch?.clientY ?? e.clientY) - rect.top
  }
}

function distToCenter(p) {
  return Math.hypot(p.x - cx.value, p.y - cy.value)
}

function clampCircle(newCx, newCy, newR) {
  const maxR = Math.min(dispW.value, dispH.value) / 2
  newR = Math.max(MIN_RADIUS, Math.min(maxR, newR))
  newCx = Math.max(newR, Math.min(dispW.value - newR, newCx))
  newCy = Math.max(newR, Math.min(dispH.value - newR, newCy))
  return { x: newCx, y: newCy, r: newR }
}

function onPointerDown(e) {
  e.preventDefault()
  const p = pointerPos(e)
  const d = distToCenter(p)
  if (d > cr.value + EDGE_HIT) return

  startPointer.value = p
  startCircle.value = { x: cx.value, y: cy.value, r: cr.value }
  mode.value = Math.abs(d - cr.value) <= EDGE_HIT ? 'resize' : 'drag'

  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)
  window.addEventListener('touchmove', onPointerMove, { passive: false })
  window.addEventListener('touchend', onPointerUp)
}

function onPointerMove(e) {
  e.preventDefault()
  if (!mode.value) return

  const p = pointerPos(e)
  const dx = p.x - startPointer.value.x
  const dy = p.y - startPointer.value.y

  if (mode.value === 'drag') {
    const c = clampCircle(startCircle.value.x + dx, startCircle.value.y + dy, cr.value)
    cx.value = c.x
    cy.value = c.y
  } else {
    const sd = Math.hypot(
      startPointer.value.x - startCircle.value.x,
      startPointer.value.y - startCircle.value.y
    )
    const cd = Math.hypot(p.x - cx.value, p.y - cy.value)
    const c = clampCircle(cx.value, cy.value, startCircle.value.r + (cd - sd))
    cr.value = c.r
    const pc = clampCircle(cx.value, cy.value, cr.value)
    cx.value = pc.x
    cy.value = pc.y
  }

  drawOverlay()
}

function onPointerUp() {
  mode.value = null
  removeWindowListeners()
}

function removeWindowListeners() {
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  window.removeEventListener('touchmove', onPointerMove)
  window.removeEventListener('touchend', onPointerUp)
}

function onWheel(e) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -8 : 8
  const c = clampCircle(cx.value, cy.value, cr.value + delta)
  cr.value = c.r
  const pc = clampCircle(cx.value, cy.value, cr.value)
  cx.value = pc.x
  cy.value = pc.y
  drawOverlay()
}

function onHover(e) {
  if (mode.value) return
  const p = pointerPos(e)
  const d = distToCenter(p)
  if (d > cr.value + EDGE_HIT) {
    cursorStyle.value = 'default'
  } else if (Math.abs(d - cr.value) <= EDGE_HIT) {
    cursorStyle.value = 'nwse-resize'
  } else {
    cursorStyle.value = 'move'
  }
}

function rotate(dir) {
  rotation.value = (rotation.value + dir * 90 + 360) % 360

  const img = imgEl.value
  const swapped = rotation.value === 90 || rotation.value === 270

  // Re-render rotated image into a temporary canvas and swap the src
  const offscreen = document.createElement('canvas')
  const ow = swapped ? natH.value : natW.value
  const oh = swapped ? natW.value : natH.value
  offscreen.width = ow
  offscreen.height = oh
  const octx = offscreen.getContext('2d')
  octx.translate(ow / 2, oh / 2)
  octx.rotate((rotation.value * Math.PI) / 180)
  octx.drawImage(img, -natW.value / 2, -natH.value / 2)

  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)

  // Swap stored natural dimensions to match the new orientation
  const tmpW = natW.value
  natW.value = natH.value
  natH.value = tmpW
  rotation.value = 0

  offscreen.toBlob(blob => {
    imageUrl.value = URL.createObjectURL(blob)
    // onImageLoad will fire and reset display dims + circle
  }, 'image/jpeg', 0.85)
}

function doCrop() {
  const img = imgEl.value
  const scale = natW.value / dispW.value

  const cropX = Math.round((cx.value - cr.value) * scale)
  const cropY = Math.round((cy.value - cr.value) * scale)
  const cropSize = Math.round(cr.value * 2 * scale)

  const canvas = document.createElement('canvas')
  canvas.width = cropSize
  canvas.height = cropSize
  const ctx = canvas.getContext('2d')

  ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize)
  canvas.toBlob(blob => emit('crop', blob), 'image/jpeg', 0.85)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Crop Profile Picture</h3>

      <div class="flex justify-center">
        <div v-if="!loaded" class="py-12">
          <Spinner class="w-8 h-8 text-indigo-600" />
        </div>
        <div v-show="loaded" class="relative inline-block select-none">
          <img
            ref="imgEl"
            :src="imageUrl"
            class="max-w-full max-h-80 block rounded"
            draggable="false"
            @load="onImageLoad"
            @error="onImageError"
          />
          <canvas
            v-if="loaded"
            ref="canvasEl"
            :width="dispW"
            :height="dispH"
            class="absolute top-0 left-0 rounded"
            :style="{ cursor: cursorStyle }"
            @mousedown="onPointerDown"
            @mousemove="onHover"
            @touchstart.prevent="onPointerDown"
            @wheel.prevent="onWheel"
          />
        </div>
      </div>

      <div class="flex items-center justify-center gap-3 mt-3">
        <button
          class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          title="Rotate left"
          @click="rotate(-1)"
        >↩️</button>
        <p class="text-xs text-gray-500">
          Drag to move &bull; drag edge or scroll to resize
        </p>
        <button
          class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          title="Rotate right"
          @click="rotate(1)"
        >↪️</button>
      </div>

      <div class="flex justify-end gap-3 mt-5">
        <button
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          @click="doCrop"
        >
          Crop & Upload
        </button>
      </div>
    </div>
  </div>
</template>
