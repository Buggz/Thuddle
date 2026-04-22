<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  open: Boolean,
  itemName: String,
  submitting: Boolean
})

const emit = defineEmits(['cancel', 'confirm'])

const reason = ref('')
const allowResubmit = ref(true)

watch(() => props.open, (newVal) => {
  if (newVal) {
    reason.value = ''
    allowResubmit.value = true
  }
})

function onConfirm() {
  emit('confirm', { reason: reason.value, allowResubmit: allowResubmit.value })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        data-testid="reject-dialog"
        class="fixed inset-0 z-[55] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="!submitting && emit('cancel')" />
        <div class="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl flex flex-col gap-4">
          <div>
            <h3 class="text-base font-bold text-gray-900">Reject "{{ itemName }}"?</h3>
            <p class="text-sm text-gray-600 mt-1">Please provide a reason to help the user understand why.</p>
          </div>
          
          <div class="flex flex-col gap-2">
            <textarea
              v-model="reason"
              data-testid="reject-reason-input"
              rows="3"
              class="w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm p-2 border"
              placeholder="Reason for rejection (optional)"
              maxlength="500"
            ></textarea>
            <div class="text-xs text-gray-500 text-right">{{ reason.length }} / 500</div>
          </div>
          
          <label class="flex items-center gap-2 cursor-pointer mt-1">
            <input
              type="checkbox"
              v-model="allowResubmit"
              data-testid="reject-allow-resubmit"
              class="rounded border-gray-300 text-red-600 focus:ring-red-500"
            >
            <span class="text-sm font-medium text-gray-700">Allow submitter to fix and resubmit</span>
          </label>
          
          <div class="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <button
              data-testid="reject-confirm-btn"
              @click="onConfirm"
              :disabled="submitting"
              class="inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm ring-1 ring-inset bg-red-600 hover:bg-red-700 ring-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 sm:w-auto disabled:opacity-50 transition-colors"
            >
              {{ submitting ? 'Rejecting…' : 'Reject Item' }}
            </button>
            <button
              data-testid="reject-cancel-btn"
              @click="emit('cancel')"
              :disabled="submitting"
              class="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>