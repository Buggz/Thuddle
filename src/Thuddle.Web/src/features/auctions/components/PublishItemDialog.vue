<script setup>
import { computed } from 'vue'
import { usePublishOutcome } from '../composables/usePublishOutcome'

const props = defineProps({
  isOpen: Boolean,
  auctionStatus: String,
  moderationPolicy: String,
  isAdmin: Boolean,
  secondsToStart: Number,
  submitting: Boolean
})

const emit = defineEmits(['confirm', 'cancel'])

const { headline, body, confirmLabel, resultingStatus } = usePublishOutcome(
  computed(() => props.auctionStatus),
  computed(() => props.moderationPolicy),
  computed(() => props.isAdmin),
  computed(() => props.secondsToStart)
)

const colorMap = {
  Live: 'emerald',
  Scheduled: 'indigo',
  PendingApproval: 'amber',
  Ended: 'gray'
}
const confirmColor = computed(() => colorMap[resultingStatus.value] || 'indigo')
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        data-testid="publish-dialog"
        :class="`publish-dialog-${resultingStatus}`"
        class="fixed inset-0 z-[55] flex items-center justify-center px-4"
        role="dialog"
        aria-modal="true"
      >
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="!submitting && emit('cancel')" />
        <div class="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <h3 class="text-base font-bold text-gray-900">{{ headline }}</h3>
              <p class="mt-2 text-sm text-gray-600 space-y-2 whitespace-pre-line" v-html="body" />
            </div>
          </div>
          
          <div class="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <button
              data-testid="publish-dialog-confirm"
              @click="emit('confirm')"
              :disabled="submitting || resultingStatus === 'Ended'"
              class="inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm ring-1 ring-inset focus:outline-none focus:ring-2 focus:ring-offset-2 sm:w-auto disabled:opacity-50 transition-colors"
              :class="{
                'bg-emerald-600 hover:bg-emerald-700 ring-emerald-600': confirmColor === 'emerald',
                'bg-indigo-600 hover:bg-indigo-700 ring-indigo-600': confirmColor === 'indigo',
                'bg-amber-500 hover:bg-amber-600 ring-amber-500': confirmColor === 'amber',
                'bg-gray-400': confirmColor === 'gray',
              }"
            >
              {{ submitting ? 'Publishing…' : confirmLabel }}
            </button>
            <button
              data-testid="publish-dialog-cancel"
              @click="emit('cancel')"
              :disabled="submitting"
              class="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:w-auto"
            >
              Keep as draft
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>