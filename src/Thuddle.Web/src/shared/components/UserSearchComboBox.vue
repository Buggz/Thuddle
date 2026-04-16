<script setup>
import { shallowRef, ref, computed, watch, nextTick } from 'vue'
import { useApi } from '@/shared/composables/useApi'
import Spinner from './Spinner.vue'

const props = defineProps({
  placeholder: { type: String, default: 'Search by name or email…' },
  allowUnknownEmail: { type: Boolean, default: false },
  excludeEmails: { type: Array, default: () => [] }
})

const emit = defineEmits(['select'])

const { authFetch } = useApi()

const query = shallowRef('')
const results = ref([])
const loading = shallowRef(false)
const open = shallowRef(false)
const activeIndex = shallowRef(-1)
const inputRef = ref(null)
const listRef = ref(null)
let debounceTimer = null

const isValidEmail = computed(() => {
  const q = query.value.trim()
  return q.includes('@') && q.includes('.') && q.length >= 5
})

const showUnknownOption = computed(() => {
  if (!props.allowUnknownEmail || !isValidEmail.value) return false
  const email = query.value.trim().toLowerCase()
  if (props.excludeEmails.some(e => e.toLowerCase() === email)) return false
  return !results.value.some(r => r.email.toLowerCase() === email)
})

const filteredResults = computed(() => {
  const excluded = new Set(props.excludeEmails.map(e => e.toLowerCase()))
  return results.value.filter(r => !excluded.has(r.email.toLowerCase()))
})

const totalOptions = computed(() =>
  filteredResults.value.length + (showUnknownOption.value ? 1 : 0)
)

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  activeIndex.value = -1

  if (!val || val.trim().length < 2) {
    results.value = []
    open.value = false
    return
  }

  loading.value = true
  open.value = true
  debounceTimer = setTimeout(() => searchUsers(val.trim()), 300)
})

async function searchUsers(q) {
  try {
    const res = await authFetch(`/api/users/search?q=${encodeURIComponent(q)}`)
    const data = await res.json()
    results.value = data
    open.value = true
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

function selectUser(user) {
  emit('select', { type: 'user', ...user })
  reset()
}

function selectUnknownEmail() {
  emit('select', { type: 'email', email: query.value.trim() })
  reset()
}

function reset() {
  query.value = ''
  results.value = []
  open.value = false
  activeIndex.value = -1
  nextTick(() => inputRef.value?.focus())
}

function onKeydown(e) {
  if (!open.value && e.key !== 'Escape') return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, totalOptions.value - 1)
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && activeIndex.value < filteredResults.value.length) {
      selectUser(filteredResults.value[activeIndex.value])
    } else if (activeIndex.value === filteredResults.value.length && showUnknownOption.value) {
      selectUnknownEmail()
    }
  } else if (e.key === 'Escape') {
    open.value = false
    activeIndex.value = -1
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onBlur() {
  // Delay to allow click on list item
  setTimeout(() => { open.value = false }, 150)
}

function onFocus() {
  if (query.value.trim().length >= 2 && (filteredResults.value.length || showUnknownOption.value)) {
    open.value = true
  }
}

function userInitials(user) {
  const name = user.displayName || user.fullName || user.email
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="relative" data-testid="user-search-combobox">
    <div class="relative">
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        role="combobox"
        :aria-expanded="open"
        aria-autocomplete="list"
        aria-controls="user-search-listbox"
        :aria-activedescendant="activeIndex >= 0 ? `user-option-${activeIndex}` : undefined"
        :placeholder="placeholder"
        data-testid="user-search-input"
        autocomplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-8"
        @keydown="onKeydown"
        @blur="onBlur"
        @focus="onFocus"
      />
      <span v-if="loading" class="absolute right-2 top-1/2 -translate-y-1/2">
        <Spinner />
      </span>
    </div>

    <ul
      v-if="open && (filteredResults.length || showUnknownOption || loading)"
      ref="listRef"
      id="user-search-listbox"
      role="listbox"
      data-testid="user-search-results"
      class="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <li
        v-for="(user, i) in filteredResults"
        :key="user.id"
        :id="`user-option-${i}`"
        role="option"
        :aria-selected="activeIndex === i"
        :data-active="activeIndex === i"
        data-testid="user-search-result"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors"
        :class="activeIndex === i ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50'"
        @mousedown.prevent="selectUser(user)"
        @mouseenter="activeIndex = i"
      >
        <span class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
          {{ userInitials(user) }}
        </span>
        <span class="flex-1 min-w-0">
          <span class="block truncate font-medium">{{ user.displayName || user.fullName || user.email }}</span>
          <span v-if="user.displayName || user.fullName" class="block truncate text-xs text-gray-400">{{ user.email }}</span>
        </span>
      </li>

      <li
        v-if="showUnknownOption"
        :id="`user-option-${filteredResults.length}`"
        role="option"
        :aria-selected="activeIndex === filteredResults.length"
        :data-active="activeIndex === filteredResults.length"
        data-testid="user-search-invite-option"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors border-t border-gray-100"
        :class="activeIndex === filteredResults.length ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50'"
        @mousedown.prevent="selectUnknownEmail()"
        @mouseenter="activeIndex = filteredResults.length"
      >
        <span class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        </span>
        <span class="flex-1 min-w-0">
          <span class="block truncate font-medium">Invite {{ query.trim() }}</span>
          <span class="block text-xs text-gray-400">Send an email invite to join Thuddle</span>
        </span>
      </li>

      <li v-if="loading && filteredResults.length === 0 && !showUnknownOption" class="px-3 py-3 text-sm text-gray-400 text-center">
        Searching…
      </li>

      <li v-if="!loading && filteredResults.length === 0 && !showUnknownOption && query.trim().length >= 2" class="px-3 py-3 text-sm text-gray-400 text-center" data-testid="user-search-no-results">
        No users found
      </li>
    </ul>
  </div>
</template>
