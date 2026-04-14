<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import Spinner from '@/shared/components/Spinner.vue'

const props = defineProps({
  imageFile: { type: File, required: true },
  maxDimension: { type: Number, default: 1920 }
})

const emit = defineEmits(['done', 'cancel'])

const imgEl = ref(null)
const imageUrl = ref(null)
const loaded = ref(false)

const natW = ref(0)
const natH = ref(0)
const rotation = ref(0)

onMounted(() => {
  imageUrl.value = URL.createObjectURL(props.imageFile)
})

onBeforeUnmount(() => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})

function onImageLoad() {
  const img = imgEl.value
  natW.value = img.naturalWidth
  natH.value = img.naturalHeight
  loaded.value = true
}

function onImageError() {
  emit('cancel')
}

function rotate(dir) {
  const img = imgEl.value
  const swapped = rotation.value === 90 || rotation.value === 270
  rotation.value = (rotation.value + dir * 90 + 360) % 360

  const offscreen = document.createElement('canvas')
  const ow = swapped ? natH.value : natW.value
  const oh = swapped ? natW.value : natH.value

  // After another 90° rotation from current displayed orientation
  offscreen.width = oh
  offscreen.height = ow
  const ctx = offscreen.getContext('2d')
  ctx.translate(oh / 2, ow / 2)
  ctx.rotate((dir * 90 * Math.PI) / 180)
  ctx.drawImage(img, -ow / 2, -oh / 2)

  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)

  natW.value = oh
  natH.value = ow
  rotation.value = 0

  offscreen.toBlob(blob => {
    imageUrl.value = URL.createObjectURL(blob)
  }, 'image/png')
}

function doSave() {
  const img = imgEl.value
  const w = natW.value
  const h = natH.value

  // Scale down if larger than max dimension
  const max = props.maxDimension
  let outW = w
  let outH = h
  if (w > max || h > max) {
    if (w >= h) {
      outW = max
      outH = Math.round(h * (max / w))
    } else {
      outH = max
      outW = Math.round(w * (max / h))
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, outW, outH)
  canvas.toBlob(blob => emit('done', blob), 'image/jpeg', 0.85)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
    <div class="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Edit Image</h3>

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
        </div>
      </div>

      <div class="flex items-center justify-center gap-3 mt-3">
        <button
          class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 transition"
          title="Rotate left"
          @click="rotate(-1)"
        >↩️</button>
        <p class="text-xs text-gray-500">Rotate if the image appears sideways</p>
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
          @click="doSave"
        >
          Upload
        </button>
      </div>
    </div>
  </div>
</template>
