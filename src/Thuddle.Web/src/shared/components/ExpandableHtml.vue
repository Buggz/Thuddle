<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const props = defineProps({
  html: { type: String, default: '' },
  collapsedMaxHeight: { type: Number, default: 96 }
})

const isExpanded = ref(false)
const hasOverflow = ref(false)
const contentEl = ref(null)

let observer = null

function measure() {
  if (!contentEl.value || isExpanded.value) return
  hasOverflow.value = contentEl.value.scrollHeight > contentEl.value.clientHeight + 2
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (contentEl.value) observer.observe(contentEl.value)
  measure()
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

watch(() => props.html, () => {
  nextTick(measure)
})
</script>

<template>
  <div data-testid="expandable-html">
    <div
      ref="contentEl"
      class="prose prose-sm max-w-none overflow-hidden"
      :style="!isExpanded ? { maxHeight: `${collapsedMaxHeight}px` } : {}"
      v-html="html"
    />
    <div
      v-if="hasOverflow && !isExpanded"
      class="pointer-events-none h-8 -mt-8 bg-gradient-to-t from-white to-transparent"
      aria-hidden="true"
    />
    <button
      v-if="hasOverflow"
      type="button"
      data-testid="expandable-html-toggle"
      :aria-expanded="isExpanded"
      class="mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
      @click="isExpanded = !isExpanded"
    >
      {{ isExpanded ? 'See less' : 'See more' }}
    </button>
  </div>
</template>
