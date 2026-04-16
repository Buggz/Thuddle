<script setup>
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useGroupsApi } from '../composables/useGroupsApi'

/**
 * Popover that lets a host add one-or-more users to a contact group.
 * - Filters existing groups as the user types.
 * - If the typed name doesn't match any existing group, offers
 *   "Create group '<name>'" as the top action.
 * - Emits `added` with { group, added, skipped } after the API round trip.
 */
const props = defineProps({
  /** User ids to add to the chosen/created group. */
  userIds: { type: Array, required: true },
  /** Label shown above the combobox. */
  title: { type: String, default: 'Add to group' }
})

const emit = defineEmits(['added', 'close'])

const { groups, load, createGroup, addMembers } = useGroupsApi()

const query = ref('')
const busy = ref(false)
const inputRef = ref(null)
const rootRef = ref(null)
const activeIndex = ref(0)

onMounted(async () => {
  await load()
  nextTick(() => inputRef.value?.focus())
  document.addEventListener('mousedown', handleOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleOutside)
})

function handleOutside(e) {
  if (!rootRef.value) return
  if (!rootRef.value.contains(e.target)) emit('close')
}

const trimmedQuery = computed(() => query.value.trim())

const filteredGroups = computed(() => {
  const q = trimmedQuery.value.toLowerCase()
  if (!q) return groups.value
  return groups.value.filter(g => g.name.toLowerCase().includes(q))
})

const exactMatch = computed(() =>
  filteredGroups.value.some(g => g.name.toLowerCase() === trimmedQuery.value.toLowerCase())
)

const showCreate = computed(() =>
  trimmedQuery.value.length > 0 && !exactMatch.value
)

/** Total rows in the listbox. Row 0 is "Create …" when visible. */
const totalRows = computed(() =>
  (showCreate.value ? 1 : 0) + filteredGroups.value.length
)

function rowIsCreate(i) {
  return showCreate.value && i === 0
}

function groupForRow(i) {
  return filteredGroups.value[showCreate.value ? i - 1 : i]
}

async function pickGroup(group) {
  if (busy.value) return
  busy.value = true
  try {
    const result = await addMembers(group.id, props.userIds)
    emit('added', { group, added: result.added, skipped: result.skipped })
  } finally {
    busy.value = false
  }
}

async function create() {
  if (busy.value) return
  const name = trimmedQuery.value
  if (!name) return
  busy.value = true
  try {
    const created = await createGroup(name, props.userIds)
    emit('added', {
      group: { id: created.id, name: created.name, memberCount: created.memberCount },
      added: created.added ?? props.userIds.length,
      skipped: created.skipped ?? 0,
      wasCreated: true
    })
  } finally {
    busy.value = false
  }
}

function onKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, totalRows.value - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (totalRows.value === 0) return
    const i = Math.min(activeIndex.value, totalRows.value - 1)
    if (rowIsCreate(i)) create()
    else pickGroup(groupForRow(i))
  } else if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
</script>

<template>
  <div
    ref="rootRef"
    data-testid="group-selector-popover"
    class="w-72 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 border border-slate-100 overflow-hidden flex flex-col"
    @click.stop
  >
    <div class="px-3 pt-3 pb-2 bg-slate-50/50 border-b border-slate-100">
      <p class="text-[10px] font-bold text-slate-400 tracking-wider uppercase mb-1">{{ title }}</p>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        placeholder="Find or create a group…"
        data-testid="group-selector-input"
        autocomplete="off"
        class="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
        @keydown="onKeydown"
      />
    </div>

    <ul
      data-testid="group-selector-results"
      class="max-h-64 overflow-auto py-1.5"
    >
      <li
        v-if="showCreate"
        data-testid="group-selector-create-option"
        role="option"
        :data-active="activeIndex === 0"
        class="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors mx-1.5 rounded-lg"
        :class="activeIndex === 0 ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-100/80'"
        @mousedown.prevent="create"
        @mouseenter="activeIndex = 0"
      >
        <span class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 border border-indigo-200/50 shadow-sm text-indigo-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </span>
        <span class="flex-1 min-w-0 flex flex-col justify-center">
          <span class="block truncate">Create group <strong class="font-bold">“{{ trimmedQuery }}”</strong></span>
          <span class="block text-[11px] font-medium text-slate-400">Adds {{ userIds.length }} {{ userIds.length === 1 ? 'person' : 'people' }}</span>
        </span>
      </li>

      <li
        v-for="(group, i) in filteredGroups"
        :key="group.id"
        :data-testid="`group-selector-option`"
        :data-group-id="group.id"
        role="option"
        :data-active="activeIndex === (showCreate ? i + 1 : i)"
        class="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer transition-colors mx-1.5 rounded-lg"
        :class="activeIndex === (showCreate ? i + 1 : i) ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100/80'"
        @mousedown.prevent="pickGroup(group)"
        @mouseenter="activeIndex = (showCreate ? i + 1 : i)"
      >
        <span class="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 border border-slate-200/50 text-slate-500 shadow-[inset_0_1px_1px_rgba(255,255,255,1)]">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        </span>
        <span class="flex-1 min-w-0 truncate font-medium">{{ group.name }}</span>
        <span 
          class="shrink-0 text-[10px] font-bold text-slate-400 tabular-nums px-1.5 py-0.5 rounded-full"
          :class="activeIndex === (showCreate ? i + 1 : i) ? 'bg-slate-200/60' : 'bg-slate-100'"
        >{{ group.memberCount }}</span>
      </li>

      <li
        v-if="!showCreate && filteredGroups.length === 0"
        class="px-4 py-8 text-xs font-medium text-slate-400 text-center leading-relaxed"
        data-testid="group-selector-empty"
      >
        You don't have any groups yet.<br />
        Type a name to create one.
      </li>
    </ul>

    <div
      v-if="busy"
      class="px-4 py-2 text-[11px] font-bold tracking-wide uppercase text-indigo-500 bg-indigo-50/50 border-t border-slate-100"
    >Saving…</div>
  </div>
</template>
