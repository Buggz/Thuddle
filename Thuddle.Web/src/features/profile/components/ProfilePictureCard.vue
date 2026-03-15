<script setup>
defineProps({
  hasProfilePicture: { type: Boolean, required: true },
  pictureUrl: { type: String, default: null },
  pictureKey: { type: Number, default: 0 },
  uploading: { type: Boolean, default: false }
})

const emit = defineEmits(['upload'])
</script>

<template>
  <div class="bg-white shadow rounded-lg p-6 mb-6">
    <h3 class="text-lg font-medium text-gray-900 mb-4">Profile Picture</h3>
    <div class="flex items-center gap-6">
      <div
        class="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden shrink-0"
      >
        <img
          v-if="hasProfilePicture && pictureUrl"
          :src="pictureUrl"
          :key="pictureKey"
          alt="Profile"
          class="w-full h-full object-cover"
        />
        <svg
          v-else
          class="w-10 h-10 text-gray-400"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
          />
        </svg>
      </div>
      <div>
        <label
          class="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-indigo-700 transition"
          :class="{ 'opacity-50 pointer-events-none': uploading }"
        >
          {{ uploading ? 'Uploading...' : 'Upload Picture' }}
          <input
            type="file"
            accept="image/*"
            class="hidden"
            @change="emit('upload', $event)"
            :disabled="uploading"
          />
        </label>
        <p class="mt-2 text-xs text-gray-500">PNG, JPG up to 5MB. Will be cropped to square.</p>
      </div>
    </div>
  </div>
</template>
