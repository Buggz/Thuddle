<script setup>
import { ref, computed, watch } from 'vue'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'

const props = defineProps({
  open: { type: Boolean, required: true },
  raffle: { type: Object, default: null },  // null = create mode
  saving: { type: Boolean, default: false },
  currency: { type: String, default: '' }
})

const emit = defineEmits(['save', 'cancel'])

const isDrawing = computed(() => props.raffle?.status === 'Drawing')
const isEdit = computed(() => props.raffle !== null)

const name = ref('')
const description = ref('')
const pricePerTicket = ref('')
const selfReportingEnabled = ref(false)
const localError = ref(null)

watch(() => props.open, (open) => {
  if (open) {
    name.value = props.raffle?.name ?? ''
    description.value = props.raffle?.description ?? ''
    pricePerTicket.value = props.raffle?.pricePerTicket != null
      ? String(props.raffle.pricePerTicket)
      : ''
    selfReportingEnabled.value = props.raffle?.selfReportingEnabled ?? false
    localError.value = null
  }
}, { immediate: true })

function buildBody() {
  if (isEdit.value) {
    // PATCH: send only fields that can change
    const body = { description: description.value || null }
    if (!isDrawing.value) {
      body.name = name.value.trim() || undefined
      body.pricePerTicket = pricePerTicket.value !== '' ? Number(pricePerTicket.value) : null
      body.selfReportingEnabled = selfReportingEnabled.value
    }
    return body
  }
  // POST: all fields
  return {
    name: name.value.trim(),
    description: description.value || null,
    pricePerTicket: pricePerTicket.value !== '' ? Number(pricePerTicket.value) : null,
    selfReportingEnabled: selfReportingEnabled.value
  }
}

function validate() {
  if (!name.value.trim()) {
    localError.value = 'Name is required.'
    return false
  }
  return true
}

function handleSave() {
  localError.value = null
  if (!validate()) return
  emit('save', buildBody())
}

function handleCancel() {
  localError.value = null
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="handleCancel" />

        <!-- Dialog -->
        <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">
          <!-- Header -->
          <div class="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <h2 class="text-lg font-bold text-gray-900">
              {{ isEdit ? 'Edit Raffle' : 'Create Raffle' }}
            </h2>
            <button
              type="button"
              class="text-gray-400 hover:text-gray-600 transition-colors"
              @click="handleCancel"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <!-- Error -->
            <div
              v-if="localError"
              class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {{ localError }}
            </div>

            <!-- Status hint when Drawing -->
            <div
              v-if="isDrawing"
              class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700"
            >
              Raffle is in <strong>Drawing</strong> state — only description can be edited.
            </div>

            <!-- Name -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Name <span class="text-red-500">*</span>
              </label>
              <input
                v-model="name"
                data-testid="raffle-name-input"
                type="text"
                :disabled="isDrawing"
                placeholder="e.g. Mystery Box Raffle"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
              />
            </div>

            <!-- Description -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Description
              </label>
              <div data-testid="raffle-description-input">
                <RichTextEditor v-model="description" />
              </div>
            </div>

            <!-- Price per ticket -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Price per ticket
              </label>
              <div class="relative">
                <input
                  v-model="pricePerTicket"
                  data-testid="raffle-price-input"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="isDrawing"
                  placeholder="Leave empty for free"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  :class="currency ? 'pr-16' : ''"
                />
                <span
                  v-if="currency"
                  data-testid="raffle-price-currency"
                  class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold uppercase tracking-wider text-gray-400"
                >
                  {{ currency }}
                </span>
              </div>
            </div>

            <!-- Self-reporting toggle -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-gray-700">Allow self-reporting</p>
                <p class="text-xs text-gray-500 mt-0.5">Participants can set their own ticket count</p>
              </div>
              <button
                type="button"
                data-testid="raffle-selfreport-toggle"
                role="switch"
                :aria-checked="selfReportingEnabled"
                :disabled="isDrawing"
                @click="selfReportingEnabled = !selfReportingEnabled"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                :class="selfReportingEnabled ? 'bg-indigo-600' : 'bg-gray-200'"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                  :class="selfReportingEnabled ? 'translate-x-6' : 'translate-x-1'"
                />
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              data-testid="raffle-cancel-btn"
              @click="handleCancel"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="raffle-save-btn"
              :disabled="saving"
              @click="handleSave"
              class="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span v-if="saving">Saving…</span>
              <span v-else>{{ isEdit ? 'Save Changes' : 'Create Raffle' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
