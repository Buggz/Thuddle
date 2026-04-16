<script setup>
import { shallowRef, ref, computed, watch, nextTick, onMounted } from 'vue'
import { useApi } from '@/shared/composables/useApi'
import { useGroupsApi } from '@/features/groups/composables/useGroupsApi'
import Spinner from './Spinner.vue'

const props = defineProps({
  placeholder: { type: String, default: 'Search by name or email…' },
  allowUnknownEmail: { type: Boolean, default: false },
  excludeEmails: { type: Array, default: () => [] },
  /** When true, also suggests contact groups matching the query. */
  includeGroups: { type: Boolean, default: false }
})

const emit = defineEmits(['select'])

const { authFetch } = useApi()
const { groups: contactGroups, load: loadGroups } = useGroupsApi()

onMounted(() => {
  if (props.includeGroups) loadGroups()
})

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

const matchingGroups = computed(() => {
  if (!props.includeGroups) return []
  const q = query.value.trim().toLowerCase()
  if (q.length < 2) return []
  return (contactGroups.value || [])
    .filter(g => g.name.toLowerCase().includes(q) && (g.memberCount || 0) > 0)
    .slice(0, 5)
})

const totalOptions = computed(() =>
  matchingGroups.value.length + filteredResults.value.length + (showUnknownOption.value ? 1 : 0)
)

function optionAt(i) {
  const groupCount = matchingGroups.value.length
  if (i < groupCount) return { kind: 'group', value: matchingGroups.value[i] }
  const userIndex = i - groupCount
  if (userIndex < filteredResults.value.length) {
    return { kind: 'user', value: filteredResults.value[userIndex] }
  }
  if (showUnknownOption.value) return { kind: 'unknown' }
  return null
}

watch(query, (val) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  activeIndex.value = -1

  if (!val || val.trim().length < 2) {
    results.value = []
    open.value = matchingGroups.value.length > 0
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

function selectGroup(group) {
  emit('select', { type: 'group', id: group.id, name: group.name, members: group.members || [] })
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
    const opt = optionAt(activeIndex.value)
    if (!opt) return
    if (opt.kind === 'group') selectGroup(opt.value)
    else if (opt.kind === 'user') selectUser(opt.value)
    else if (opt.kind === 'unknown') selectUnknownEmail()
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
  if (query.value.trim().length >= 2 && (matchingGroups.value.length || filteredResults.value.length || showUnknownOption.value)) {
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
      v-if="open && (matchingGroups.length || filteredResults.length || showUnknownOption || loading)"
      ref="listRef"
      id="user-search-listbox"
      role="listbox"
      data-testid="user-search-results"
      class="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <li
        v-for="(group, gi) in matchingGroups"
        :key="`group-${group.id}`"
        :id="`user-option-${gi}`"
        role="option"
        :aria-selected="activeIndex === gi"
        :data-active="activeIndex === gi"
        data-testid="user-search-group-result"
        :data-group-id="group.id"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors"
        :class="activeIndex === gi ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50'"
        @mousedown.prevent="selectGroup(group)"
        @mouseenter="activeIndex = gi"
      >
        <span class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-indigo-100 text-indigo-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </span>
        <span class="flex-1 min-w-0">
          <span class="block truncate font-medium">{{ group.name }}</span>
          <span class="block truncate text-xs text-gray-400">Group · {{ group.memberCount }} {{ group.memberCount === 1 ? 'person' : 'people' }}</span>
        </span>
      </li>

      <li
        v-for="(user, ui) in filteredResults"
        :key="user.id"
        :id="`user-option-${matchingGroups.length + ui}`"
        role="option"
        :aria-selected="activeIndex === matchingGroups.length + ui"
        :data-active="activeIndex === matchingGroups.length + ui"
        data-testid="user-search-result"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors"
        :class="activeIndex === matchingGroups.length + ui ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50'"
        @mousedown.prevent="selectUser(user)"
        @mouseenter="activeIndex = matchingGroups.length + ui"
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
        :id="`user-option-${matchingGroups.length + filteredResults.length}`"
        role="option"
        :aria-selected="activeIndex === matchingGroups.length + filteredResults.length"
        :data-active="activeIndex === matchingGroups.length + filteredResults.length"
        data-testid="user-search-invite-option"
        class="flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors border-t border-gray-100"
        :class="activeIndex === matchingGroups.length + filteredResults.length ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50'"
        @mousedown.prevent="selectUnknownEmail()"
        @mouseenter="activeIndex = matchingGroups.length + filteredResults.length"
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

      <li v-if="loading && filteredResults.length === 0 && matchingGroups.length === 0 && !showUnknownOption" class="px-3 py-3 text-sm text-gray-400 text-center">
        Searching…
      </li>

      <li v-if="!loading && filteredResults.length === 0 && matchingGroups.length === 0 && !showUnknownOption && query.trim().length >= 2" class="px-3 py-3 text-sm text-gray-400 text-center" data-testid="user-search-no-results">
        No users found
      </li>
    </ul>
  </div>
</template>
