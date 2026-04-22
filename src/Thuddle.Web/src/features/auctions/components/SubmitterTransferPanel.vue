<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  attendees: { type: Array, required: true },
  selectedIds: { type: Set, required: true },
  pinnedIds: { type: Set, required: true },
  pinnedLabels: { type: Object, default: () => ({}) },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['add', 'remove'])

const leftSearch = ref('')
const rightSearch = ref('')

const normalize = (s) => (s || '').toLowerCase()

const availableAttendees = computed(() =>
  props.attendees
    .filter((a) => !props.selectedIds.has(a.userId) && !props.pinnedIds.has(a.userId))
    .filter((a) => {
      const q = normalize(leftSearch.value)
      if (!q) return true
      return normalize(a.displayName).includes(q) || normalize(a.email).includes(q)
    })
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
)

const pinnedAttendees = computed(() =>
  props.attendees
    .filter((a) => props.pinnedIds.has(a.userId))
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
)

const selectedAttendees = computed(() =>
  props.attendees
    .filter((a) => props.selectedIds.has(a.userId) && !props.pinnedIds.has(a.userId))
    .filter((a) => {
      const q = normalize(rightSearch.value)
      if (!q) return true
      return normalize(a.displayName).includes(q) || normalize(a.email).includes(q)
    })
    .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
)

const availableCount = computed(() =>
  props.attendees.filter((a) => !props.selectedIds.has(a.userId) && !props.pinnedIds.has(a.userId)).length
)

const selectedCount = computed(() =>
  props.attendees.filter((a) => props.selectedIds.has(a.userId) || props.pinnedIds.has(a.userId)).length
)

function onAdd(userId) {
  if (props.disabled) return
  emit('add', userId)
}

function onRemove(userId) {
  if (props.disabled || props.pinnedIds.has(userId)) return
  emit('remove', userId)
}

function onKeydown(e, action, userId) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    action(userId)
  }
}
</script>

<template>
  <div
    data-testid="submitter-transfer-panel"
    class="grid grid-cols-1 sm:grid-cols-2 rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden"
  >
    <!-- LEFT: Available attendees -->
    <div class="flex flex-col order-2 sm:order-1 sm:border-r border-gray-200">
      <div class="p-3 border-b border-gray-200 bg-white">
        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">All attendees</label>
        <div class="relative">
          <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            v-model="leftSearch"
            data-testid="submitter-search-available"
            type="text"
            placeholder="Search…"
            class="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div
        data-testid="submitter-list-available"
        role="listbox"
        aria-label="Available attendees"
        class="flex-1 overflow-y-auto min-h-45 max-h-90"
      >
        <TransitionGroup
          name="transfer-left"
          tag="div"
          class="divide-y divide-gray-100"
        >
          <div
            v-for="a in availableAttendees"
            :key="a.userId"
            data-testid="submitter-row-available"
            role="option"
            tabindex="0"
            class="group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors hover:bg-indigo-50 focus-visible:bg-indigo-50 focus-visible:outline-none"
            :class="{ 'opacity-50 pointer-events-none': disabled }"
            @click="onAdd(a.userId)"
            @keydown="(e) => onKeydown(e, onAdd, a.userId)"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-800 truncate">{{ a.displayName }}</div>
              <div class="text-xs text-gray-400 truncate">{{ a.email }}</div>
            </div>
            <svg class="w-4 h-4 shrink-0 ml-2 text-gray-300 group-hover:text-indigo-500 group-focus-visible:text-indigo-500 transition-colors" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </TransitionGroup>

        <div
          v-if="availableAttendees.length === 0"
          class="flex items-center justify-center py-10 px-4 text-sm text-gray-400"
        >
          {{ leftSearch ? 'No matches.' : 'All attendees are selected.' }}
        </div>
      </div>

      <div data-testid="submitter-count-available" class="border-t border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">
        {{ availableCount }} {{ availableCount === 1 ? 'attendee' : 'attendees' }}
      </div>
    </div>

    <!-- RIGHT: Selected submitters -->
    <div class="flex flex-col order-1 sm:order-2">
      <div class="p-3 border-b border-gray-200 bg-white">
        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Can submit items</label>
        <div class="relative">
          <svg class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            v-model="rightSearch"
            data-testid="submitter-search-selected"
            type="text"
            placeholder="Search…"
            class="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div
        data-testid="submitter-list-selected"
        role="listbox"
        aria-label="Selected submitters"
        class="flex-1 overflow-y-auto min-h-45 max-h-90"
      >
        <!-- Pinned admins (not affected by search, always on top) -->
        <div v-if="pinnedAttendees.length" class="divide-y divide-gray-100 border-b border-gray-200 bg-white/60">
          <div
            v-for="a in pinnedAttendees"
            :key="a.userId"
            data-testid="submitter-row-pinned"
            role="option"
            aria-disabled="true"
            class="flex items-center gap-2 px-3 py-2.5"
          >
            <svg class="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-gray-700 truncate">
                {{ a.displayName }}
                <span class="font-normal text-gray-400 text-xs ml-1">{{ pinnedLabels[a.userId] }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Selected (removable) submitters -->
        <TransitionGroup
          name="transfer-right"
          tag="div"
          class="divide-y divide-gray-100"
        >
          <div
            v-for="a in selectedAttendees"
            :key="a.userId"
            data-testid="submitter-row-selected"
            role="option"
            tabindex="0"
            class="group flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
            :class="{ 'opacity-50 pointer-events-none': disabled }"
            @click="onRemove(a.userId)"
            @keydown="(e) => onKeydown(e, onRemove, a.userId)"
          >
            <div class="min-w-0">
              <div class="text-sm font-semibold text-gray-800 truncate">{{ a.displayName }}</div>
              <div class="text-xs text-gray-400 truncate">{{ a.email }}</div>
            </div>
            <svg class="w-4 h-4 shrink-0 ml-2 text-gray-300 group-hover:text-red-500 group-focus-visible:text-red-500 transition-colors" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </TransitionGroup>

        <div
          v-if="selectedAttendees.length === 0"
          class="flex items-center justify-center py-10 px-4 text-sm text-gray-400"
        >
          {{ rightSearch ? 'No matches.' : 'No additional submitters selected.' }}
        </div>
      </div>

      <div data-testid="submitter-count-selected" class="border-t border-gray-200 bg-white px-3 py-2 text-xs text-gray-400">
        {{ selectedCount }} can submit
      </div>
    </div>
  </div>
</template>

<style scoped>
/* LEFT list: items enter from right, leave by shrinking */
.transfer-left-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.transfer-left-leave-active {
  transition: opacity 0.15s ease, max-height 0.15s ease;
  overflow: hidden;
}
.transfer-left-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.transfer-left-leave-to {
  opacity: 0;
  max-height: 0;
}
.transfer-left-move {
  transition: transform 0.2s ease;
}

/* RIGHT list: items enter from left, leave by shrinking */
.transfer-right-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.transfer-right-leave-active {
  transition: opacity 0.15s ease, max-height 0.15s ease;
  overflow: hidden;
}
.transfer-right-enter-from {
  opacity: 0;
  transform: translateX(-12px);
}
.transfer-right-leave-to {
  opacity: 0;
  max-height: 0;
}
.transfer-right-move {
  transition: transform 0.2s ease;
}
</style>
