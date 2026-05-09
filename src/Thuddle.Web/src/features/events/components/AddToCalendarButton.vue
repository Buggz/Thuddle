<script setup>
import { buildEventIcs, downloadIcs } from '@/features/events/utils/ics'

const props = defineProps({
  uid: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: null },
  location: { type: String, default: null },
  start: { type: String, required: true },
  end: { type: String, default: null },
  filename: { type: String, required: true },
  variant: {
    type: String,
    default: 'secondary',
    validator: (v) => ['primary', 'secondary'].includes(v)
  }
})

function handleClick() {
  try {
    const ics = buildEventIcs({
      uid: props.uid,
      title: props.title,
      description: props.description,
      location: props.location,
      start: props.start,
      end: props.end
    })
    downloadIcs(props.filename, ics)
  } catch (err) {
    // Sacrebleu — should not happen in a real browser, but leave a trace.
     
    console.error('Failed to generate calendar file', err)
  }
}
</script>

<template>
  <button
    type="button"
    data-testid="add-to-calendar-btn"
    @click="handleClick"
    :class="[
      'w-full sm:w-auto justify-center inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
      variant === 'primary'
        ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-500 hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-indigo-600'
        : 'bg-white text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 hover:text-gray-900'
    ]"
  >
    <svg
      class="w-4 h-4 opacity-70"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6.75h15A1.5 1.5 0 0 1 21 8.25v11.25A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5V8.25a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
    Add to calendar
  </button>
</template>
