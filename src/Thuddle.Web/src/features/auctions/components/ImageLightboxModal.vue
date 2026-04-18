<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  open: { type: Boolean, required: true },
  imageUrl: { type: String, default: null },
  alt: { type: String, default: '' }
})

const emit = defineEmits(['close'])

const closeBtn = ref(null)

function onKeydown(e) {
  if (!props.open) return
  if (e.key === 'Escape') emit('close')
}

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    closeBtn.value?.focus()
  }
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="lightbox">
      <div
        v-if="open"
        data-testid="image-lightbox"
        class="fixed inset-0 z-[60] flex items-center justify-center"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/80" @click="emit('close')" />
        <button
          ref="closeBtn"
          data-testid="image-lightbox-close"
          @click="emit('close')"
          class="absolute top-4 right-4 z-10 inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/15 text-white hover:bg-white/30 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Close image preview"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <img
          v-if="imageUrl"
          :src="imageUrl"
          :alt="alt"
          class="relative z-0 max-h-[90vh] max-w-[92vw] object-contain shadow-2xl"
          @click.stop
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lightbox-enter-active, .lightbox-leave-active { transition: opacity 0.18s ease; }
.lightbox-enter-from, .lightbox-leave-to { opacity: 0; }
</style>
