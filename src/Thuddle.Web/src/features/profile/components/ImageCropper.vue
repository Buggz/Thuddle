<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Spinner from '@/shared/components/Spinner.vue'

const props = defineProps({
  imageFile: { type: File, required: true },
  shape: { type: String, default: 'circle' },
  aspectRatio: { type: Number, default: null },
  title: { type: String, default: null }
})

const emit = defineEmits(['crop', 'cancel'])

const isCircle = computed(() => props.shape === 'circle')
const dialogTitle = computed(() => props.title ?? (isCircle.value ? 'Crop Profile Picture' : 'Crop Image'))

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
// Circle mode
const cr = ref(0)
// Rectangle mode
const halfW = ref(0)
const halfH = ref(0)

const mode = ref(null)
const startPointer = ref({ x: 0, y: 0 })
const startCrop = ref({ x: 0, y: 0, r: 0, hw: 0, hh: 0 })
const cursorStyle = ref('default')

const rotation = ref(0)

const EDGE_HIT = 14
const MIN_RADIUS = 20
const MIN_HALF = 20

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

  loaded.value = true
  nextTick(() => {
    dispW.value = img.clientWidth
    dispH.value = img.clientHeight

    cx.value = Math.floor(dispW.value / 2)
    cy.value = Math.floor(dispH.value / 2)

    if (isCircle.value) {
      const minDim = Math.min(dispW.value, dispH.value)
      cr.value = Math.floor(minDim * 0.4)
    } else {
      initRect()
    }

    nextTick(drawOverlay)
  })
}

function initRect() {
  const ratio = props.aspectRatio ?? 16 / 9
  // Fit the rectangle to 80% of available space
  let hw = dispW.value * 0.4
  let hh = hw / ratio
  if (hh > dispH.value * 0.4) {
    hh = dispH.value * 0.4
    hw = hh * ratio
  }
  halfW.value = Math.floor(hw)
  halfH.value = Math.floor(hh)
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
  if (isCircle.value) {
    ctx.beginPath()
    ctx.arc(cx.value, cy.value, cr.value, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(
      cx.value - halfW.value, cy.value - halfH.value,
      halfW.value * 2, halfH.value * 2
    )
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.lineWidth = 2
  if (isCircle.value) {
    ctx.beginPath()
    ctx.arc(cx.value, cy.value, cr.value, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.strokeRect(
      cx.value - halfW.value, cy.value - halfH.value,
      halfW.value * 2, halfH.value * 2
    )
  }
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

// Rectangle hit-testing
function isNearRectEdge(p) {
  const l = cx.value - halfW.value, r = cx.value + halfW.value
  const t = cy.value - halfH.value, b = cy.value + halfH.value
  const inOuter = p.x >= l - EDGE_HIT && p.x <= r + EDGE_HIT && p.y >= t - EDGE_HIT && p.y <= b + EDGE_HIT
  const inInner = p.x >= l + EDGE_HIT && p.x <= r - EDGE_HIT && p.y >= t + EDGE_HIT && p.y <= b - EDGE_HIT
  return inOuter && !inInner
}

function isInsideRect(p) {
  return p.x >= cx.value - halfW.value && p.x <= cx.value + halfW.value
      && p.y >= cy.value - halfH.value && p.y <= cy.value + halfH.value
}

function clampCircle(newCx, newCy, newR) {
  const maxR = Math.min(dispW.value, dispH.value) / 2
  newR = Math.max(MIN_RADIUS, Math.min(maxR, newR))
  newCx = Math.max(newR, Math.min(dispW.value - newR, newCx))
  newCy = Math.max(newR, Math.min(dispH.value - newR, newCy))
  return { x: newCx, y: newCy, r: newR }
}

function clampRect(newCx, newCy, newHW, newHH) {
  const ratio = props.aspectRatio ?? (halfW.value / halfH.value)
  const maxHW = dispW.value / 2
  const maxHH = dispH.value / 2
  newHW = Math.max(MIN_HALF, Math.min(maxHW, newHW))
  newHH = newHW / ratio
  if (newHH > maxHH) {
    newHH = maxHH
    newHW = newHH * ratio
  }
  if (newHH < MIN_HALF) {
    newHH = MIN_HALF
    newHW = newHH * ratio
  }
  newCx = Math.max(newHW, Math.min(dispW.value - newHW, newCx))
  newCy = Math.max(newHH, Math.min(dispH.value - newHH, newCy))
  return { x: newCx, y: newCy, hw: newHW, hh: newHH }
}

function onPointerDown(e) {
  e.preventDefault()
  const p = pointerPos(e)

  if (isCircle.value) {
    const d = distToCenter(p)
    if (d > cr.value + EDGE_HIT) return
    startPointer.value = p
    startCrop.value = { x: cx.value, y: cy.value, r: cr.value }
    mode.value = Math.abs(d - cr.value) <= EDGE_HIT ? 'resize' : 'drag'
  } else {
    const nearEdge = isNearRectEdge(p)
    const inside = isInsideRect(p)
    if (!nearEdge && !inside) return
    startPointer.value = p
    startCrop.value = { x: cx.value, y: cy.value, hw: halfW.value, hh: halfH.value }
    mode.value = nearEdge ? 'resize' : 'drag'
  }

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

  if (isCircle.value) {
    if (mode.value === 'drag') {
      const c = clampCircle(startCrop.value.x + dx, startCrop.value.y + dy, cr.value)
      cx.value = c.x
      cy.value = c.y
    } else {
      const sd = Math.hypot(startPointer.value.x - startCrop.value.x, startPointer.value.y - startCrop.value.y)
      const cd = Math.hypot(p.x - cx.value, p.y - cy.value)
      const c = clampCircle(cx.value, cy.value, startCrop.value.r + (cd - sd))
      cr.value = c.r
      const pc = clampCircle(cx.value, cy.value, cr.value)
      cx.value = pc.x
      cy.value = pc.y
    }
  } else {
    if (mode.value === 'drag') {
      const r = clampRect(startCrop.value.x + dx, startCrop.value.y + dy, halfW.value, halfH.value)
      cx.value = r.x
      cy.value = r.y
    } else {
      const sd = Math.hypot(startPointer.value.x - startCrop.value.x, startPointer.value.y - startCrop.value.y)
      const cd = Math.hypot(p.x - cx.value, p.y - cy.value)
      const delta = cd - sd
      const r = clampRect(cx.value, cy.value, startCrop.value.hw + delta, startCrop.value.hh)
      halfW.value = r.hw
      halfH.value = r.hh
      const rc = clampRect(cx.value, cy.value, halfW.value, halfH.value)
      cx.value = rc.x
      cy.value = rc.y
    }
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
  if (isCircle.value) {
    const c = clampCircle(cx.value, cy.value, cr.value + delta)
    cr.value = c.r
    const pc = clampCircle(cx.value, cy.value, cr.value)
    cx.value = pc.x
    cy.value = pc.y
  } else {
    const r = clampRect(cx.value, cy.value, halfW.value + delta, halfH.value)
    halfW.value = r.hw
    halfH.value = r.hh
    const rc = clampRect(cx.value, cy.value, halfW.value, halfH.value)
    cx.value = rc.x
    cy.value = rc.y
  }
  drawOverlay()
}

function onHover(e) {
  if (mode.value) return
  const p = pointerPos(e)
  if (isCircle.value) {
    const d = distToCenter(p)
    if (d > cr.value + EDGE_HIT) {
      cursorStyle.value = 'default'
    } else if (Math.abs(d - cr.value) <= EDGE_HIT) {
      cursorStyle.value = 'nwse-resize'
    } else {
      cursorStyle.value = 'move'
    }
  } else {
    const nearEdge = isNearRectEdge(p)
    const inside = isInsideRect(p)
    if (nearEdge) {
      cursorStyle.value = 'nwse-resize'
    } else if (inside) {
      cursorStyle.value = 'move'
    } else {
      cursorStyle.value = 'default'
    }
  }
}

function rotate(dir) {
  rotation.value = (rotation.value + dir * 90 + 360) % 360

  const img = imgEl.value
  const swapped = rotation.value === 90 || rotation.value === 270

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

  const tmpW = natW.value
  natW.value = natH.value
  natH.value = tmpW
  rotation.value = 0

  offscreen.toBlob(blob => {
    imageUrl.value = URL.createObjectURL(blob)
  }, 'image/jpeg', 0.85)
}

function doCrop() {
  const img = imgEl.value
  const scale = natW.value / dispW.value

  if (isCircle.value) {
    const cropX = Math.round((cx.value - cr.value) * scale)
    const cropY = Math.round((cy.value - cr.value) * scale)
    const cropSize = Math.round(cr.value * 2 * scale)

    const canvas = document.createElement('canvas')
    canvas.width = cropSize
    canvas.height = cropSize
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize)
    canvas.toBlob(blob => emit('crop', blob), 'image/jpeg', 0.85)
  } else {
    const cropX = Math.round((cx.value - halfW.value) * scale)
    const cropY = Math.round((cy.value - halfH.value) * scale)
    const cropW = Math.round(halfW.value * 2 * scale)
    const cropH = Math.round(halfH.value * 2 * scale)

    const canvas = document.createElement('canvas')
    canvas.width = cropW
    canvas.height = cropH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
    canvas.toBlob(blob => emit('crop', blob), 'image/jpeg', 0.85)
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">{{ dialogTitle }}</h3>

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
          data-testid="cropper-cancel-btn"
          class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          data-testid="cropper-crop-btn"
          class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          @click="doCrop"
        >
          Crop & Upload
        </button>
      </div>
    </div>
  </div>
</template>
