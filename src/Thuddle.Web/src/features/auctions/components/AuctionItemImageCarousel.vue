<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import ImageLightboxModal from './ImageLightboxModal.vue'

const props = defineProps({
  images: { type: Array, default: () => [] },
  alt: { type: String, default: '' }
})

const index = ref(0)
const lightboxOpen = ref(false)

const hasImages = computed(() => props.images.length > 0)
const current = computed(() => props.images[index.value] ?? null)

function next() {
  if (!hasImages.value) return
  index.value = (index.value + 1) % props.images.length
}
function prev() {
  if (!hasImages.value) return
  index.value = (index.value - 1 + props.images.length) % props.images.length
}
function go(i) {
  index.value = Math.max(0, Math.min(props.images.length - 1, i))
}

function onKey(e) {
  if (lightboxOpen.value) return
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div data-testid="auction-image-carousel" class="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
    <div v-if="hasImages" class="relative aspect-4/3 w-full bg-gray-100">
      <button
        type="button"
        class="absolute inset-0 group focus:outline-none"
        @click="lightboxOpen = true"
        :aria-label="`Open image ${index + 1} in lightbox`"
      >
        <img
          :src="current"
          :alt="alt"
          class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <span class="absolute bottom-3 right-3 rounded-full bg-black/40 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white opacity-0 group-hover:opacity-100 transition-opacity">
          Click to expand
        </span>
      </button>

      <button
        v-if="images.length > 1"
        type="button"
        data-testid="auction-image-prev"
        @click="prev"
        class="absolute left-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="Previous image"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>
      <button
        v-if="images.length > 1"
        type="button"
        data-testid="auction-image-next"
        @click="next"
        class="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/90 text-gray-700 shadow hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="Next image"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>

    <div v-else class="flex aspect-4/3 w-full items-center justify-center text-gray-300">
      <svg class="w-16 h-16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
      </svg>
    </div>

    <div v-if="hasImages && images.length > 1" class="w-full border-t border-gray-200 bg-white/80 px-2 py-2 sm:px-3">
      <div class="flex w-full gap-2 overflow-x-auto">
      <button
        v-for="(img, i) in images"
        :key="img + i"
        type="button"
        :data-testid="`auction-image-thumbnail-${i}`"
        @click="go(i)"
        class="h-14 w-20 shrink-0 overflow-hidden rounded-md border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-24"
        :class="i === index ? 'scale-[1.03] border-indigo-600 ring-2 ring-indigo-300' : 'border-gray-200 hover:border-gray-400'"
        :aria-label="`Show image ${i + 1}`"
        :aria-current="i === index ? 'true' : undefined"
      >
        <img :src="img" :alt="`${alt} thumbnail ${i + 1}`" class="h-full w-full object-cover" />
        <span class="sr-only">Show image {{ i + 1 }}</span>
      </button>
      </div>
    </div>

    <ImageLightboxModal
      :open="lightboxOpen"
      :image-url="current"
      :alt="alt"
      @close="lightboxOpen = false"
    />
  </div>
</template>
