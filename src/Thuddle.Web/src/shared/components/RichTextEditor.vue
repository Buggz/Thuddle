<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import ImageResize from 'tiptap-extension-resize-image'
import { TextStyle } from '@tiptap/extension-text-style'
import { shallowRef, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  uploadImage: { type: Function, default: null }
})

const emit = defineEmits(['update:modelValue'])
const uploading = shallowRef(false)

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] }
    }),
    TextStyle,
    ImageResize.configure({ inline: false, allowBase64: false })
  ],
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none min-h-[200px] px-4 py-3 focus:outline-none'
    }
  },
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML())
  }
})

watch(() => props.modelValue, (val) => {
  if (editor.value && editor.value.getHTML() !== val) {
    editor.value.commands.setContent(val, false)
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function setHeading(level) {
  editor.value?.chain().focus().toggleHeading({ level }).run()
}

function setParagraph() {
  editor.value?.chain().focus().setParagraph().run()
}

function toggleBold() {
  editor.value?.chain().focus().toggleBold().run()
}

function toggleItalic() {
  editor.value?.chain().focus().toggleItalic().run()
}

function toggleUnderline() {
  editor.value?.chain().focus().toggleUnderline().run()
}

function toggleStrike() {
  editor.value?.chain().focus().toggleStrike().run()
}

async function insertImage() {
  if (!props.uploadImage) return

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png,image/gif,image/webp'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    uploading.value = true
    try {
      const url = await props.uploadImage(file)
      if (url) {
        editor.value?.chain().focus().setImage({ src: url }).run()
      }
    } finally {
      uploading.value = false
    }
  }
  input.click()
}

function isActive(name, attrs) {
  return editor.value?.isActive(name, attrs) ?? false
}
</script>

<template>
  <div class="rounded-lg border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200" data-testid="rte-toolbar">
      <!-- Block Type -->
      <button type="button" @click="setParagraph()" data-testid="rte-btn-paragraph"
        :class="['rounded px-2 py-1 text-xs font-medium transition-colors', isActive('paragraph') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >P</button>
      <button type="button" @click="setHeading(1)" data-testid="rte-btn-h1"
        :class="['rounded px-2 py-1 text-xs font-bold transition-colors', isActive('heading', { level: 1 }) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >H1</button>
      <button type="button" @click="setHeading(2)" data-testid="rte-btn-h2"
        :class="['rounded px-2 py-1 text-xs font-bold transition-colors', isActive('heading', { level: 2 }) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >H2</button>
      <button type="button" @click="setHeading(3)" data-testid="rte-btn-h3"
        :class="['rounded px-2 py-1 text-xs font-bold transition-colors', isActive('heading', { level: 3 }) ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >H3</button>

      <div class="w-px h-5 bg-gray-300 mx-1" />

      <!-- Inline formatting -->
      <button type="button" @click="toggleBold()" data-testid="rte-btn-bold"
        :class="['rounded px-2 py-1 text-xs font-bold transition-colors', isActive('bold') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >B</button>
      <button type="button" @click="toggleItalic()" data-testid="rte-btn-italic"
        :class="['rounded px-2 py-1 text-xs font-medium italic transition-colors', isActive('italic') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >I</button>
      <button type="button" @click="toggleUnderline()" data-testid="rte-btn-underline"
        :class="['rounded px-2 py-1 text-xs font-medium underline transition-colors', isActive('underline') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >U</button>
      <button type="button" @click="toggleStrike()" data-testid="rte-btn-strike"
        :class="['rounded px-2 py-1 text-xs font-medium line-through transition-colors', isActive('strike') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-200']"
      >S</button>

      <div class="w-px h-5 bg-gray-300 mx-1" />

      <!-- Image upload -->
      <button v-if="uploadImage" type="button" @click="insertImage()" :disabled="uploading" data-testid="rte-btn-image"
        :class="['rounded px-2 py-1 text-xs font-medium transition-colors', uploading ? 'opacity-50 cursor-wait' : 'text-gray-600 hover:bg-gray-200']"
      >
        <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" />
        </svg>
        {{ uploading ? 'Uploading…' : '' }}
      </button>
    </div>

    <!-- Editor area -->
    <EditorContent :editor="editor" />
  </div>
</template>
