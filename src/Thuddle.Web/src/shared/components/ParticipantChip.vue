<script setup>
defineProps({
  userId: { type: String, required: true },
  displayName: { type: String, required: true },
  profilePictureUrl: { type: String, default: null },
  subline: { type: String, default: null }
})
</script>

<template>
  <div
    :data-testid="`participant-chip-${userId}`"
    class="flex items-center gap-3 min-w-0"
  >
    <img
      v-if="profilePictureUrl"
      :src="profilePictureUrl"
      :alt="displayName"
      class="w-8 h-8 rounded-full object-cover shrink-0"
    />
    <span
      v-else
      class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0"
    >
      {{ displayName?.charAt(0)?.toUpperCase() ?? '?' }}
    </span>
    <div class="min-w-0">
      <p class="text-sm font-semibold text-gray-900 truncate">{{ displayName }}</p>
      <p v-if="subline" class="text-xs text-gray-400">{{ subline }}</p>
      <slot v-else name="subline" />
    </div>
  </div>
</template>
