<script setup>
import { ref, computed, onMounted } from 'vue'
import UserSearchComboBox from '@/shared/components/UserSearchComboBox.vue'
import { useRafflesStore } from '../stores/raffles'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

const props = defineProps({
  eventId: { type: String, required: true },
  raffleId: { type: String, required: true },
  raffle: { type: Object, required: true }
})

const store = useRafflesStore()
const loading = ref(false)
const error = ref(null)

const filterText = ref('')
const filteredEntries = computed(() => {
  const entries = store.entries.get(props.raffleId) ?? []
  if (!filterText.value.trim()) return entries
  const q = filterText.value.toLowerCase()
  return entries.filter(e =>
    e.displayName?.toLowerCase().includes(q) ||
    e.name?.toLowerCase().includes(q)
  )
})

// Pending remove
const removeDialogOpen = ref(false)
const pendingRemoveUserId = ref(null)

// Ticket edit state: userId → { value, saving, error }
const editState = ref({})

const isOpen = () => props.raffle?.status === 'Open'

async function loadEntries() {
  loading.value = true
  try {
    await store.fetchEntries(props.eventId, props.raffleId)
  } catch (err) {
    error.value = err.message || 'Failed to load entries.'
  } finally {
    loading.value = false
  }
}

async function onUserSelected(selection) {
  if (selection.type !== 'user') return
  const userId = selection.id
  if (!userId || !isOpen()) return

  // Default to 1 ticket for new entry
  const entry = (store.entries.get(props.raffleId) ?? []).find((e) => e.userId === userId)
  const tickets = entry ? entry.tickets : 1

  try {
    await store.setEntryTickets(props.eventId, props.raffleId, userId, tickets)
    await store.fetchEntries(props.eventId, props.raffleId)
  } catch (err) {
    error.value = err.message || 'Failed to add entry.'
  }
}

function initEditState(userId, tickets) {
  if (!editState.value[userId]) {
    editState.value[userId] = { value: tickets, original: tickets, saving: false, error: null }
  } else if (editState.value[userId].original !== tickets && !editState.value[userId].saving) {
    const state = editState.value[userId]
    const hasDraft = state.value !== state.original
    state.original = tickets
    // Don't clobber an in-progress edit; only sync the displayed value when
    // the user has no pending draft.
    if (!hasDraft) state.value = tickets
  }
}

function updateTickets(userId, delta) {
  const state = editState.value[userId]
  if (!state) return
  const current = Number(state.value) || 0
  const next = Math.max(0, current + delta)
  if (next !== current) state.value = next
}

function isDraft(userId) {
  const state = editState.value[userId]
  return state ? state.value !== state.original : false
}

async function saveTickets(userId) {
  const state = editState.value[userId]
  if (!state || !isDraft(userId)) return
  state.saving = true
  state.error = null
  try {
    const val = Number(state.value)
    await store.setEntryTickets(props.eventId, props.raffleId, userId, val)
    state.original = val
  } catch (err) {
    state.error = err.message || 'Failed to save.'
    state.value = state.original
  } finally {
    state.saving = false
  }
}

function confirmRemove(userId) {
  pendingRemoveUserId.value = userId
  removeDialogOpen.value = true
}

async function executeRemove() {
  const userId = pendingRemoveUserId.value
  removeDialogOpen.value = false
  pendingRemoveUserId.value = null
  try {
    await store.removeEntry(props.eventId, props.raffleId, userId)
  } catch (err) {
    error.value = err.message || 'Failed to remove entry.'
  }
}

onMounted(() => {
  loadEntries()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Host controls: Add participant / Lock submissions -->
    <div v-if="isOpen()" class="space-y-4">
      <div class="space-y-2">
        <p class="text-xs font-bold uppercase tracking-widest text-gray-400">Add participant</p>
        <div data-testid="raffle-entry-add-btn">
          <UserSearchComboBox
            placeholder="Search participants by name…"
            @select="onUserSelected"
          />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-sm text-gray-400 py-4 text-center">Loading entries…</div>

    <!-- Entries table -->
    <template v-else>
      <div v-if="!store.entries.get(raffleId)?.length" class="text-sm text-gray-400 text-center py-4">
        No entries yet. Add participants above.
      </div>

      <div v-else class="space-y-3">
        <!-- Filter input -->
        <div class="relative">
          <label for="raffle-entries-filter-input" class="sr-only">Filter participants</label>
          <input
            id="raffle-entries-filter-input"
            v-model="filterText"
            type="text"
            data-testid="raffle-entries-filter"
            placeholder="Filter participants…"
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-8 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
          <button
            v-if="filterText"
            type="button"
            data-testid="raffle-entries-filter-clear"
            @click="filterText = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear filter"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="text-xs font-bold uppercase tracking-widest text-gray-500">
          Entries ({{ store.entries.get(raffleId)?.length ?? 0 }})
        </p>

        <!-- Empty filter state -->
        <div
          v-if="filteredEntries.length === 0"
          data-testid="raffle-entries-empty-filter"
          class="text-sm text-gray-400 text-center py-4"
        >
          No participants match "{{ filterText }}"
        </div>

        <!-- Using a grid for cleaner alignment -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            v-for="entry in filteredEntries"
            :key="entry.userId"
            :data-testid="`raffle-entry-row-${entry.userId}`"
            class="group flex flex-col justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:shadow relative transition-shadow"
          >
            <!-- Init edit state reactively -->
            <template v-if="initEditState(entry.userId, entry.tickets) === undefined" />

            <div class="flex items-center justify-between">
              <!-- Profile Picture & Name -->
              <div class="flex flex-1 items-center gap-2 overflow-hidden">
                <div class="h-6 w-6 shrink-0 rounded-full bg-indigo-100 flex items-center justify-center overflow-hidden border border-indigo-50">
                  <img v-if="entry.profilePictureUrl" :src="entry.profilePictureUrl" alt="" class="h-full w-full object-cover" />
                  <span v-else class="text-[10px] font-bold text-indigo-700">{{ entry.displayName?.charAt(0).toUpperCase() || '?' }}</span>
                </div>
                <span class="text-sm font-semibold text-gray-900 truncate pr-2" :title="entry.displayName">
                  {{ entry.displayName }}
                </span>
              </div>

              <!-- Remove button -->
              <button
                type="button"
                :data-testid="`raffle-entry-remove-${entry.userId}`"
                @click="confirmRemove(entry.userId)"
                class="shrink-0 p-1.5 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all z-10"
                title="Remove entry"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="flex items-center justify-between bg-gray-50/50 rounded-lg p-1.5 border border-gray-50/50 group-hover:border-gray-100 transition-colors">
              <span class="text-xs font-bold text-gray-400 uppercase tracking-wider pl-2">Tickets</span>

          <!-- Ticket count input -->
              <div v-if="editState[entry.userId]" class="relative flex items-center gap-1">
                <div class="flex items-center rounded-lg bg-white border border-gray-200 p-0.5 shadow-sm">
                  <button
                    type="button"
                    @click="updateTickets(entry.userId, -1)"
                    :disabled="editState[entry.userId].saving || editState[entry.userId].value <= 0"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 transition-colors"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
                    </svg>
                  </button>

                  <input
                    v-model.number="editState[entry.userId].value"
                    :data-testid="`raffle-tickets-input-${entry.userId}`"
                    type="number"
                    min="0"
                    :disabled="editState[entry.userId].saving"
                    @blur="saveTickets(entry.userId)"
                    @keydown.enter.prevent="$event.target.blur()"
                    class="w-10 border-0 bg-transparent px-1 py-1 text-sm text-center font-bold text-indigo-700 focus:ring-0 appearance-none disabled:text-gray-400"
                    style="-moz-appearance: textfield;"
                  />

                  <button
                    type="button"
                    @click="updateTickets(entry.userId, 1)"
                    :disabled="editState[entry.userId].saving"
                    class="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 transition-colors"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                </div>
                
                <!-- Explicit save button (space preserved to prevent layout shift) -->
                <button
                  :class="[
                    'ml-1 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all duration-200',
                    isDraft(entry.userId) ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-1 pointer-events-none'
                  ]"
                  @click="saveTickets(entry.userId)"
                  :disabled="editState[entry.userId].saving || !isDraft(entry.userId)"
                  :tabindex="isDraft(entry.userId) ? 0 : -1"
                  title="Save changes"
                >
                  <svg v-if="editState[entry.userId].saving" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </button>
              </div>

              <!-- Tickets label (before edit state initialises) -->
              <span v-else class="text-sm font-bold text-gray-700 px-3 py-1">
                {{ entry.tickets }}
              </span>
            </div>

            <!-- Error for this row -->
            <span v-if="editState[entry.userId]?.error" class="text-[10px] font-semibold text-red-500 absolute bottom-1 right-2">
              Error
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- Total tickets summary -->
    <div v-if="store.entries.get(raffleId)?.length" class="text-xs text-gray-400">
      Total tickets in pool:
      <strong class="text-gray-700">
        {{ (store.entries.get(raffleId) ?? []).reduce((s, e) => s + e.tickets, 0) }}
      </strong>
    </div>

    <!-- Remove confirm dialog -->
    <ConfirmDialog
      :open="removeDialogOpen"
      title="Remove entry"
      message="Remove this participant's entry from the raffle?"
      confirm-label="Remove"
      @confirm="executeRemove"
      @cancel="removeDialogOpen = false"
    />
  </div>
</template>
