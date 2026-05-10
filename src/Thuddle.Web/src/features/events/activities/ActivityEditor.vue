<script setup>
import { ref, computed, watch } from 'vue'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'
import { useApi } from '@/shared/composables/useApi'
import { activityApi } from '@/api'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  eventId: { type: String, required: true },
  activity: { type: Object, default: null }, // null = create mode
  saving: { type: Boolean, default: false },
  saveError: { type: String, default: null }
})

const emit = defineEmits(['update:isOpen', 'save'])

const { authFetch } = useApi()

const isEdit = computed(() => props.activity !== null)

const title = ref('')
const description = ref('')
const startsAt = ref('')
const endsAt = ref('')
const maxParticipants = ref('')
const hiddenFromNonParticipants = ref(false)
const localError = ref(null)

function toLocalDatetime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function snapshotFromActivity(activity) {
  title.value = activity?.title ?? ''
  description.value = activity?.description ?? ''
  startsAt.value = toLocalDatetime(activity?.startsAt)
  endsAt.value = toLocalDatetime(activity?.endsAt)
  maxParticipants.value = activity?.maxParticipants != null ? String(activity.maxParticipants) : ''
  hiddenFromNonParticipants.value = activity?.hiddenFromNonParticipants ?? false
}

watch(() => props.isOpen, (open) => {
  if (open) {
    snapshotFromActivity(props.activity)
    localError.value = null
  }
}, { immediate: true })

watch(() => props.activity, (activity) => {
  if (props.isOpen) {
    snapshotFromActivity(activity)
  }
})

const endsAtError = computed(() => {
  if (!endsAt.value || !startsAt.value) return null
  return new Date(endsAt.value) <= new Date(startsAt.value)
    ? 'End time must be after start time.'
    : null
})

function validate() {
  if (!title.value.trim()) {
    localError.value = 'Title is required.'
    return false
  }
  if (!startsAt.value) {
    localError.value = 'Start time is required.'
    return false
  }
  if (endsAtError.value) {
    localError.value = endsAtError.value
    return false
  }
  if (maxParticipants.value !== '' && Number(maxParticipants.value) < 1) {
    localError.value = 'Max participants must be at least 1 if specified.'
    return false
  }
  return true
}

function buildBody() {
  return {
    title: title.value.trim(),
    description: description.value || null,
    startsAt: new Date(startsAt.value).toISOString(),
    endsAt: endsAt.value ? new Date(endsAt.value).toISOString() : null,
    maxParticipants: maxParticipants.value !== '' ? Number(maxParticipants.value) : null,
    hiddenFromNonParticipants: hiddenFromNonParticipants.value
  }
}

async function uploadImage(file) {
  return activityApi.uploadDescriptionImage(authFetch, props.eventId, file)
}

function handleSave() {
  localError.value = null
  if (!validate()) return
  emit('save', buildBody())
}

function handleCancel() {
  emit('update:isOpen', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4"
        data-testid="activity-editor-modal"
      >
        <!-- Backdrop — clickable on desktop; mobile panel is full-screen -->
        <div class="absolute inset-0 bg-black/40 hidden sm:block" @click="handleCancel" />

        <!-- Modal panel: full-screen on mobile, centred card on desktop -->
        <div
          class="relative bg-white flex flex-col w-full flex-1 overflow-hidden
                 sm:flex-none sm:max-w-2xl sm:rounded-xl sm:shadow-xl sm:max-h-[90vh]"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <h2 class="text-lg font-bold text-gray-900">
              {{ isEdit ? 'Edit Activity' : 'Add Activity' }}
            </h2>
            <button
              type="button"
              data-testid="activity-editor-close"
              @click="handleCancel"
              class="w-11 h-11 flex items-center justify-center rounded-lg
                     text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <!-- Error -->
            <div
              v-if="localError || saveError"
              class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
            >
              {{ localError || saveError }}
            </div>

            <!-- Title -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Title <span class="text-red-500">*</span>
              </label>
              <input
                v-model="title"
                data-testid="activity-form-title"
                type="text"
                maxlength="120"
                placeholder="e.g. Board Game Tournament"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <!-- Description (Tiptap rich text) -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
              <div data-testid="activity-form-description">
                <RichTextEditor v-model="description" :upload-image="uploadImage" />
              </div>
            </div>

            <!-- Starts at -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Starts at <span class="text-red-500">*</span>
              </label>
              <input
                v-model="startsAt"
                data-testid="activity-form-starts-at"
                type="datetime-local"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <!-- Ends at (optional) -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Ends at <span class="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                v-model="endsAt"
                data-testid="activity-form-ends-at"
                type="datetime-local"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                :class="{ 'border-red-400 focus:ring-red-400': endsAtError }"
              />
              <p v-if="endsAtError" class="mt-1 text-xs text-red-600">{{ endsAtError }}</p>
            </div>

            <!-- Max participants -->
            <div>
              <label class="block text-sm font-semibold text-gray-700 mb-1.5">
                Max participants <span class="text-xs text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                v-model="maxParticipants"
                data-testid="activity-form-max-participants"
                type="number"
                inputmode="numeric"
                placeholder="Leave blank for no limit"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <!-- Hidden from non-participants -->
            <div class="flex items-start gap-3">
              <div class="flex h-5 items-center">
                <input
                  id="activity-form-hidden-toggle"
                  v-model="hiddenFromNonParticipants"
                  data-testid="activity-form-hidden-toggle"
                  type="checkbox"
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <div class="min-w-0">
                <label for="activity-form-hidden-toggle" class="text-sm font-semibold text-gray-700 cursor-pointer">
                  Hide from people who haven't joined the event
                </label>
                <p class="text-xs text-gray-400 mt-0.5">Only event participants and admins will see this activity.</p>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-4 border-t border-gray-100 shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              data-testid="activity-form-cancel"
              @click="handleCancel"
              class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="activity-form-submit"
              :disabled="saving"
              @click="handleSave"
              class="w-full sm:w-auto inline-flex items-center justify-center px-4 py-3 min-h-11 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span v-if="saving">Saving…</span>
              <span v-else>{{ isEdit ? 'Save Changes' : 'Create Activity' }}</span>
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
