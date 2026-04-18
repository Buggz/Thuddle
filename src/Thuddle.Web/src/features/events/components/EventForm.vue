<script setup>
import { computed, watch } from 'vue'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'

const props = defineProps({
  modelValue: { type: Object, required: true },
  submitted: { type: Boolean, default: false },
  testIdPrefix: { type: String, default: 'event' },
  uploadImage: { type: Function, default: null },
  showCost: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}

watch(() => props.modelValue.visibility, (v) => {
  if (v === 1) update('joinMode', 1)
})

/** Earliest selectable datetime (start of today, so 15-min steps align to :00/:15/:30/:45). */
const nowLocal = computed(() => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`
})

/** End picker cannot be earlier than the chosen start. */
const minEnd = computed(() => props.modelValue.start || nowLocal.value)

/** Start of today — used to validate that start is not in the past. */
const startOfToday = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
})

const fieldErrors = computed(() => {
  if (!props.submitted) return {}
  const f = props.modelValue
  const errs = {}
  if (!f.title?.trim()) errs.title = 'Title is required.'
  if (!f.location?.trim()) errs.location = 'Location is required.'
  if (!f.start) errs.start = 'Start date is required.'
  else if (new Date(f.start) < startOfToday.value) errs.start = 'Start must be today or later.'
  if (!f.end) errs.end = 'End date is required.'
  else if (f.start && new Date(f.end) <= new Date(f.start)) errs.end = 'End must be after start.'
  if (f.capacity != null && f.capacity !== '' && (!Number.isInteger(Number(f.capacity)) || Number(f.capacity) < 1))
    errs.capacity = 'Capacity must be at least 1.'
  return errs
})

const isValid = computed(() => {
  const f = props.modelValue
  return (
    f.title?.trim().length > 0 &&
    f.location?.trim().length > 0 &&
    !!f.start &&
    !!f.end &&
    new Date(f.start) >= startOfToday.value &&
    new Date(f.end) > new Date(f.start) &&
    (f.capacity == null || f.capacity === '' || (Number.isInteger(Number(f.capacity)) && Number(f.capacity) >= 1))
  )
})

const liveHints = computed(() => {
  const f = props.modelValue
  const hints = {}
  if (f.start && f.end && new Date(f.end) <= new Date(f.start))
    hints.end = 'End must be after start.'
  return hints
})

function inputClass(field) {
  const err = fieldErrors.value[field] || liveHints.value[field]
  return [
    'w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500',
    err
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
      : 'border-gray-300 focus:border-indigo-500'
  ]
}

defineExpose({ isValid, fieldErrors })
</script>

<template>
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-400">*</span></label>
      <input
        :value="modelValue.title"
        @input="update('title', $event.target.value)"
        type="text"
        :data-testid="`${testIdPrefix}-title-input`"
        :class="inputClass('title')"
        placeholder="Event title"
      />
      <p v-if="fieldErrors.title" :data-testid="`${testIdPrefix}-title-error`" class="mt-1 text-xs text-red-600">{{ fieldErrors.title }}</p>
    </div>

    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">Location <span class="text-red-400">*</span></label>
      <textarea
        :value="modelValue.location"
        @input="update('location', $event.target.value)"
        rows="3"
        :data-testid="`${testIdPrefix}-location-input`"
        :class="inputClass('location')"
        placeholder="Where is this event?"
      />
      <p v-if="fieldErrors.location" :data-testid="`${testIdPrefix}-location-error`" class="mt-1 text-xs text-red-600">{{ fieldErrors.location }}</p>
    </div>

    <div :data-testid="`${testIdPrefix}-description-editor`">
      <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
      <RichTextEditor
        :modelValue="modelValue.description || ''"
        @update:modelValue="update('description', $event)"
        :upload-image="uploadImage"
      />
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Start <span class="text-red-400">*</span></label>
        <input
          :value="modelValue.start"
          @input="update('start', $event.target.value)"
          type="datetime-local"
          :data-testid="`${testIdPrefix}-start-input`"
          step="900"
          :min="nowLocal"
          :class="inputClass('start')"
        />
        <p v-if="fieldErrors.start" :data-testid="`${testIdPrefix}-start-error`" class="mt-1 text-xs text-red-600">{{ fieldErrors.start }}</p>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">End <span class="text-red-400">*</span></label>
        <input
          :value="modelValue.end"
          @input="update('end', $event.target.value)"
          type="datetime-local"
          :data-testid="`${testIdPrefix}-end-input`"
          step="900"
          :min="minEnd"
          :class="inputClass('end')"
        />
        <p v-if="fieldErrors.end" :data-testid="`${testIdPrefix}-end-error`" class="mt-1 text-xs text-red-600">{{ fieldErrors.end }}</p>
        <p v-else-if="liveHints.end" :data-testid="`${testIdPrefix}-end-hint`" class="mt-1 text-xs text-amber-600">{{ liveHints.end }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
        <select
          :value="modelValue.visibility"
          @change="update('visibility', Number($event.target.value))"
          :data-testid="`${testIdPrefix}-visibility-select`"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option :value="0">Public</option>
          <option :value="1">Unlisted</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Who can join?</label>
        <select
          :value="modelValue.joinMode"
          @change="update('joinMode', Number($event.target.value))"
          :disabled="modelValue.visibility === 1"
          :data-testid="`${testIdPrefix}-joinmode-select`"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option :value="0">Anyone</option>
          <option :value="1">Invite only</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Max attendees <span class="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          :value="modelValue.capacity"
          @input="update('capacity', $event.target.value === '' ? null : Number($event.target.value))"
          type="number"
          min="1"
          :data-testid="`${testIdPrefix}-capacity-input`"
          :class="inputClass('capacity')"
          placeholder="No limit"
        />
        <p v-if="fieldErrors.capacity" :data-testid="`${testIdPrefix}-capacity-error`" class="mt-1 text-xs text-red-600">{{ fieldErrors.capacity }}</p>
      </div>
      <div v-if="showCost">
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Cost <span class="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          :value="modelValue.cost"
          @input="update('cost', $event.target.value === '' ? null : Number($event.target.value))"
          type="number"
          min="0"
          step="0.01"
          :data-testid="`${testIdPrefix}-cost-input`"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Free"
        />
      </div>
    </div>
  </div>
</template>
