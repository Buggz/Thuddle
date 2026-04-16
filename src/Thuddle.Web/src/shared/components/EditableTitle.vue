<script setup>
import { ref, nextTick, watch } from 'vue'

/**
 * Click-to-edit title. Shows as typography until clicked, then transforms
 * into an input that commits on Enter/blur. Esc cancels.
 */
const props = defineProps({
  modelValue: { type: String, required: true },
  testId: { type: String, default: 'editable-title' },
  placeholder: { type: String, default: 'Untitled' },
  ariaLabel: { type: String, default: 'Title' },
  maxLength: { type: Number, default: 80 }
})

const emit = defineEmits(['update:modelValue', 'commit'])

const editing = ref(false)
const draft = ref(props.modelValue)
const inputRef = ref(null)

watch(() => props.modelValue, (val) => {
  if (!editing.value) draft.value = val
})

async function startEdit() {
  draft.value = props.modelValue
  editing.value = true
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function commit() {
  if (!editing.value) return
  const next = draft.value.trim()
  editing.value = false
  if (!next || next === props.modelValue) return
  emit('update:modelValue', next)
  emit('commit', next)
}

function cancel() {
  editing.value = false
  draft.value = props.modelValue
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}
</script>

<template>
  <div class="inline-flex items-center gap-2 group relative">
    <input
      v-if="editing"
      ref="inputRef"
      v-model="draft"
      :maxlength="maxLength"
      :aria-label="ariaLabel"
      :data-testid="`${testId}-input`"
      name="thuddle-inline-edit"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      data-lpignore="true"
      data-1p-ignore="true"
      data-form-type="other"
      data-bwignore="true"
      class="bg-transparent border-b-2 border-indigo-500 text-indigo-900 px-0.5 outline-none font-bold w-full min-w-[8ch] selection:bg-indigo-100"
      :style="{ font: 'inherit' }"
      @keydown="onKeydown"
      @blur="commit"
    />
    <button
      v-else
      type="button"
      :data-testid="testId"
      class="font-bold text-slate-900 cursor-text hover:text-indigo-600 rounded-sm transition-all text-left outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-2"
      :style="{ font: 'inherit' }"
      :aria-label="`Rename ${ariaLabel.toLowerCase()}`"
      @click="startEdit"
    >{{ modelValue || placeholder }}</button>

    <svg
      v-if="!editing"
      class="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
      fill="none" stroke="currentColor" stroke-width="2.5.5" viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
    </svg>
  </div>
</template>
