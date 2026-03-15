<script setup>
const displayName = defineModel('displayName', { type: String, required: true })

defineProps({
  savedName: { type: String, required: true },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits(['save'])
</script>

<template>
  <div class="bg-white shadow rounded-lg p-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">Display Name</h3>
    <div class="flex gap-3">
      <input
        v-model="displayName"
        type="text"
        maxlength="50"
        placeholder="Enter a display name"
        class="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
      <button
        @click="emit('save')"
        :disabled="saving || displayName === savedName"
        class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ saving ? 'Saving...' : 'Save' }}
      </button>
    </div>
  </div>
</template>
