<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRafflesStore } from '../stores/raffles'
import RaffleEditor from './RaffleEditor.vue'
import RaffleEntries from './RaffleEntries.vue'
import RaffleDrawConsole from './RaffleDrawConsole.vue'
import RaffleParticipantView from './RaffleParticipantView.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import { formatCurrency } from '@/shared/formatCurrency'

const props = defineProps({
  eventId: { type: String, required: true },
  isHost: { type: Boolean, default: false },
  // When true, show Add/Edit/Delete authoring controls. Defaults to false so
  // the section is operational-only unless the parent opts in (e.g. Manage Event).
  canAuthor: { type: Boolean, default: false },
  currency: { type: String, default: '' }
})

function formatPrice(amount) {
  return formatCurrency(amount, props.currency)
}

const store = useRafflesStore()

const loading = ref(false)
const error = ref(null)
const editorOpen = ref(false)
const editingRaffle = ref(null) // null = create
const saving = ref(false)
const saveError = ref(null)
const expandedRaffleId = ref(null)
const deleteDialogOpen = ref(false)
const pendingDeleteId = ref(null)

const eventRaffleIds = computed(() => store.rafflesByEvent.get(props.eventId) ?? [])
const eventRaffles = computed(() =>
  eventRaffleIds.value.map((id) => store.raffles.get(id)).filter(Boolean)
)

async function loadRaffles() {
  loading.value = true
  error.value = null
  try {
    await store.fetchRaffles(props.eventId)
  } catch (err) {
    error.value = err.message || 'Failed to load raffles.'
  } finally {
    loading.value = false
  }
}

async function toggleExpand(raffleId) {
  if (expandedRaffleId.value === raffleId) {
    expandedRaffleId.value = null
    return
  }
  expandedRaffleId.value = raffleId
  // Load full raffle detail (entries) on first expand
  try {
    await store.fetchRaffle(props.eventId, raffleId)
  } catch { /* best-effort */ }
}

function openCreate() {
  editingRaffle.value = null
  saveError.value = null
  editorOpen.value = true
}

function openEdit(raffle, e) {
  e?.stopPropagation()
  editingRaffle.value = raffle
  saveError.value = null
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
  editingRaffle.value = null
  saveError.value = null
}

async function handleSave(body) {
  saving.value = true
  saveError.value = null
  try {
    if (editingRaffle.value) {
      await store.patchRaffle(props.eventId, editingRaffle.value.id, body)
    } else {
      await store.createRaffle(props.eventId, body)
    }
    closeEditor()
    // Refresh list — SignalR fires too, but let's not rely solely on it
    await store.fetchRaffles(props.eventId)
  } catch (err) {
    saveError.value = err.message || 'Failed to save raffle.'
  } finally {
    saving.value = false
  }
}

function confirmDelete(raffleId, e) {
  e?.stopPropagation()
  pendingDeleteId.value = raffleId
  deleteDialogOpen.value = true
}

async function executeDelete() {
  const id = pendingDeleteId.value
  deleteDialogOpen.value = false
  pendingDeleteId.value = null
  try {
    await store.deleteRaffle(props.eventId, id)
    if (expandedRaffleId.value === id) expandedRaffleId.value = null
    await store.fetchRaffles(props.eventId)
  } catch (err) {
    error.value = err.message || 'Failed to delete raffle.'
  }
}

function statusBadgeClass(status) {
  return status === 'Drawing'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
}

onMounted(() => {
  loadRaffles()
})
</script>

<template>
  <div data-testid="raffles-section" class="space-y-4">
    <!-- Section header -->
    <div class="flex items-center justify-between">
      <h3 class="text-base font-bold text-gray-900">Raffles</h3>
      <button
        v-if="isHost && canAuthor"
        type="button"
        data-testid="raffle-create-btn"
        @click="openCreate"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add Raffle
      </button>
    </div>

    <!-- Error -->
    <div
      v-if="error"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 flex justify-center">
      <div class="text-sm text-gray-400 animate-pulse">Loading raffles…</div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="!eventRaffles.length"
      class="text-center py-12 border border-dashed border-gray-200 rounded-2xl bg-gray-50/50"
    >
      <div class="text-3xl mb-3" aria-hidden="true">🎟️</div>
      <p class="text-sm font-semibold text-gray-700">No raffles yet</p>
      <p v-if="isHost && canAuthor" class="text-xs text-gray-400 mt-1">
        Click "Add Raffle" to create the first one.
      </p>
      <p v-else-if="isHost" class="text-xs text-gray-400 mt-1">
        Add raffles from <strong>Manage Event</strong> &rarr; Raffles.
      </p>
    </div>

    <!-- Raffle cards -->
    <div v-else class="space-y-3">
      <div
        v-for="raffle in eventRaffles"
        :key="raffle.id"
        :data-testid="`raffle-card-${raffle.id}`"
        class="rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md"
        :class="raffle.deletedAt
          ? 'border-gray-200 bg-gray-50 opacity-75'
          : 'border-gray-200 bg-white'"
      >
        <!-- Card header (click to expand) -->
        <button
          type="button"
          class="w-full flex items-center gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-inset"
          @click="toggleExpand(raffle.id)"
        >
          <!-- Expand chevron -->
          <svg
            class="w-4 h-4 text-gray-400 shrink-0 transition-transform duration-200"
            :class="expandedRaffleId === raffle.id ? 'rotate-180' : ''"
            fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>

          <!-- Name & status -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span
                class="text-sm font-bold truncate"
                :class="raffle.deletedAt ? 'text-gray-500 line-through' : 'text-gray-900'"
              >{{ raffle.name }}</span>
              <span
                v-if="raffle.deletedAt"
                :data-testid="`raffle-deleted-badge-${raffle.id}`"
                class="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] uppercase font-bold tracking-wider bg-gray-100 text-gray-600 border-gray-300"
              >
                Deleted
              </span>
              <span
                v-else
                :data-testid="`raffle-status-badge-${raffle.id}`"
                class="inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] uppercase font-bold tracking-wider"
                :class="statusBadgeClass(raffle.status)"
              >
                {{ raffle.status }}
              </span>
            </div>
            <div class="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
              <span>{{ raffle.entryCount ?? 0 }} participant{{ (raffle.entryCount ?? 0) === 1 ? '' : 's' }}</span>
              <span>·</span>
              <span>{{ raffle.totalTickets ?? 0 }} ticket{{ (raffle.totalTickets ?? 0) === 1 ? '' : 's' }}</span>
              <template v-if="raffle.pricePerTicket != null">
                <span>·</span>
                <span>{{ formatPrice(raffle.pricePerTicket) }} / ticket</span>
              </template>
            </div>
          </div>

          <!-- Host actions (inline, stop propagation) -->
          <div v-if="isHost && canAuthor && !raffle.deletedAt" class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              :data-testid="`raffle-edit-btn-${raffle.id}`"
              class="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Edit raffle"
              @click="openEdit(raffle, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
              </svg>
            </button>
            <button
              v-if="raffle.status === 'Open'"
              type="button"
              :data-testid="`raffle-delete-btn-${raffle.id}`"
              class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Delete raffle"
              @click="confirmDelete(raffle.id, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </button>

        <!-- Expanded detail -->
        <Transition name="slide">
          <div
            v-if="expandedRaffleId === raffle.id"
            class="border-t border-gray-100 px-5 py-5 space-y-6"
          >
            <!-- Soft-deleted notice (host-only, since participants don't see deleted raffles) -->
            <div
              v-if="raffle.deletedAt"
              :data-testid="`raffle-deleted-notice-${raffle.id}`"
              class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
            >
              <p class="font-semibold">This raffle has been deleted.</p>
              <p class="text-xs mt-0.5 text-amber-700">
                Tickets and draw history are kept here for your records (e.g. refunds). It's no longer visible to participants.
              </p>
            </div>

            <!-- Host view -->
            <template v-if="isHost">
              <RaffleDrawConsole
                v-if="!raffle.deletedAt"
                :event-id="eventId"
                :raffle-id="raffle.id"
                :raffle="raffle"
              />
              <div class="border-t border-gray-100 pt-5">
                <RaffleEntries
                  :event-id="eventId"
                  :raffle-id="raffle.id"
                  :raffle="raffle"
                />
              </div>
            </template>

            <!-- Participant view -->
            <template v-else>
              <RaffleParticipantView
                :event-id="eventId"
                :raffle-id="raffle.id"
                :raffle="raffle"
                :currency="currency"
              />
            </template>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Save error (shown above editor when modal is open) -->
    <div
      v-if="saveError && editorOpen"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] rounded-xl bg-red-600 text-white px-5 py-3 text-sm font-semibold shadow-xl"
    >
      {{ saveError }}
    </div>

    <!-- Editor modal -->
    <RaffleEditor
      :open="editorOpen"
      :raffle="editingRaffle"
      :saving="saving"
      :currency="currency"
      @save="handleSave"
      @cancel="closeEditor"
    />

    <!-- Delete confirmation -->
    <ConfirmDialog
      :open="deleteDialogOpen"
      title="Delete raffle"
      message="This will permanently delete the raffle and all its entries. This action cannot be undone."
      confirm-label="Delete"
      @confirm="executeDelete"
      @cancel="deleteDialogOpen = false"
    />
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: grid-template-rows 0.2s ease, opacity 0.2s ease;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
