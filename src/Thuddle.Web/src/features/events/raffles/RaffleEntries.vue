<script setup>
import { ref, onMounted } from 'vue'
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
    editState.value[userId] = { value: tickets, saving: false, error: null }
  } else if (editState.value[userId].value !== tickets && !editState.value[userId].saving) {
    editState.value[userId].value = tickets
  }
}

async function saveTickets(userId) {
  const state = editState.value[userId]
  if (!state || !isOpen()) return
  state.saving = true
  state.error = null
  try {
    await store.setEntryTickets(props.eventId, props.raffleId, userId, Number(state.value))
  } catch (err) {
    state.error = err.message || 'Failed to save.'
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
    <!-- Add participant (Open only) -->
    <div v-if="isOpen()" class="space-y-2">
      <p class="text-xs font-bold uppercase tracking-widest text-gray-400">Add participant</p>
      <div data-testid="raffle-entry-add-btn">
        <UserSearchComboBox
          placeholder="Search participants by name…"
          @select="onUserSelected"
        />
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
        <p class="text-xs font-bold uppercase tracking-widest text-gray-500">
          Entries ({{ store.entries.get(raffleId)?.length ?? 0 }})
        </p>

        <!-- Using a grid for cleaner alignment -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            v-for="entry in store.entries.get(raffleId)"
            :key="entry.userId"
            :data-testid="`raffle-entry-row-${entry.userId}`"
            class="group flex flex-col justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm hover:shadow relative transition-shadow"
          >
            <!-- Init edit state reactively -->
            <template v-if="initEditState(entry.userId, entry.tickets) === undefined" />

            <div class="flex items-center justify-between">
              <!-- Name -->
              <span class="flex-1 text-sm font-semibold text-gray-900 truncate pr-2" :title="entry.displayName">
                {{ entry.displayName }}
              </span>

              <!-- Remove button (Open only) -->
              <button
                v-if="isOpen()"
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
              <div v-if="editState[entry.userId] && isOpen()" class="relative flex items-center">
                <input
                  v-model.number="editState[entry.userId].value"
                  :data-testid="`raffle-tickets-input-${entry.userId}`"
                  type="number"
                  min="0"
                  :disabled="editState[entry.userId].saving"
                  @blur="saveTickets(entry.userId)"
                  @keydown.enter.prevent="$event.target.blur()"
                  class="w-16 rounded-md border-0 bg-white px-2 py-1 text-sm text-center font-bold text-indigo-700 shadow-sm ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:bg-gray-50 disabled:text-gray-400 disabled:ring-gray-100 transition-all appearance-none"
                  style="-moz-appearance: textfield;"
                />
                
                <!-- Saving spinner overlay -->
                <div v-if="editState[entry.userId].saving" class="absolute inset-0 flex items-center justify-center bg-white/80 rounded-md">
                   <svg class="animate-spin h-3 w-3 text-indigo-600" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              </div>

              <!-- Tickets label (when not Open) -->
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
