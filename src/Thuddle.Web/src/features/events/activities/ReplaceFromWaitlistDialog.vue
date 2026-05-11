<script setup>
import { ref, watch } from 'vue'
import { useActivitiesStore } from './store'
import { formatRelative } from '@/shared/utils/relativeTime'

const props = defineProps({
  open: { type: Boolean, required: true },
  eventId: { type: String, required: true },
  activityId: { type: String, required: true },
  removeParticipant: { type: Object, required: true },
  activityTitle: { type: String, required: true }
})

const emit = defineEmits(['update:open', 'replaced', 'fall-back-to-remove'])

const store = useActivitiesStore()
const waitlist = ref([])
const loading = ref(false)
const error = ref(null)
const notice = ref(null)
const selectedUserId = ref(null)
const confirming = ref(false)

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  waitlist.value = []
  selectedUserId.value = null
  error.value = null
  notice.value = null
  loading.value = true
  try {
    const list = await store.fetchWaitlist(props.eventId, props.activityId)
    if (list.length === 0) {
      emit('fall-back-to-remove')
      emit('update:open', false)
      return
    }
    waitlist.value = list
  } catch (err) {
    error.value = err.message || 'Failed to load waitlist.'
  } finally {
    loading.value = false
  }
}, { immediate: true })

async function handleConfirm() {
  if (!selectedUserId.value) return
  confirming.value = true
  error.value = null
  notice.value = null
  try {
    await store.replaceParticipant(
      props.eventId,
      props.activityId,
      props.removeParticipant.userId,
      selectedUserId.value
    )
    emit('replaced')
    emit('update:open', false)
  } catch (err) {
    if (err.code === 'waitlist_entry_gone') {
      waitlist.value = waitlist.value.filter((e) => e.userId !== selectedUserId.value)
      selectedUserId.value = null
      notice.value = 'That user is no longer on the waitlist.'
      if (waitlist.value.length === 0) {
        emit('fall-back-to-remove')
        emit('update:open', false)
      }
    } else {
      error.value = err.message || 'Failed to replace participant.'
    }
  } finally {
    confirming.value = false
  }
}

function handleCancel() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center"
        role="dialog"
        aria-modal="true"
        data-testid="replace-from-waitlist-dialog"
      >
        <div class="absolute inset-0 bg-black/40" @click="handleCancel" />
        <div class="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <h3 class="text-base font-semibold text-gray-900 mb-1">Replace participant</h3>
          <p class="text-sm text-gray-600 mb-4">
            Choose who replaces <strong>{{ removeParticipant.displayName }}</strong> in <strong>{{ activityTitle }}</strong>.
          </p>

          <div
            v-if="loading"
            data-testid="replace-from-waitlist-loading"
            class="flex items-center justify-center py-8"
          >
            <svg class="w-6 h-6 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>

          <div v-else class="max-h-64 overflow-y-auto space-y-1 mb-4">
            <button
              v-for="entry in waitlist"
              :key="entry.userId"
              type="button"
              :data-testid="`activity-waitlist-choose-${entry.userId}`"
              @click="selectedUserId = entry.userId"
              :class="[
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                selectedUserId === entry.userId
                  ? 'bg-indigo-50 ring-1 ring-indigo-300'
                  : 'hover:bg-gray-50'
              ]"
            >
              <img
                v-if="entry.avatarUrl"
                :src="entry.avatarUrl"
                :alt="entry.displayName"
                class="w-8 h-8 rounded-full object-cover shrink-0"
              />
              <span v-else class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {{ entry.displayName?.charAt(0)?.toUpperCase() ?? '?' }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-gray-900 truncate">{{ entry.displayName }}</p>
                <p class="text-xs text-gray-400">Joined {{ formatRelative(entry.joinedWaitlistAt) }}</p>
              </div>
              <span v-if="selectedUserId === entry.userId" class="shrink-0">
                <svg class="w-4 h-4 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </span>
            </button>
          </div>

          <p v-if="notice" class="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {{ notice }}
          </p>

          <p
            v-if="error"
            data-testid="replace-from-waitlist-error"
            class="mb-3 text-sm text-red-600"
          >
            {{ error }}
          </p>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              data-testid="replace-from-waitlist-cancel"
              :disabled="confirming"
              @click="handleCancel"
              class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="replace-from-waitlist-confirm"
              :disabled="!selectedUserId || confirming"
              @click="handleConfirm"
              class="px-3 py-1.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span v-if="confirming">Replacing…</span>
              <span v-else>Replace {{ removeParticipant.displayName }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
