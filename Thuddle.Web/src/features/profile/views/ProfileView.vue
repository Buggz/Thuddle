<script setup>
import { onMounted } from 'vue'
import { useProfileApi } from '@/features/profile/composables/useProfileApi'
import ProfilePictureCard from '@/features/profile/components/ProfilePictureCard.vue'
import DisplayNameCard from '@/features/profile/components/DisplayNameCard.vue'

const {
  displayName,
  savedName,
  saving,
  uploading,
  message,
  error,
  hasProfilePicture,
  pictureUrl,
  pictureKey,
  loadProfile,
  saveDisplayName,
  uploadPicture
} = useProfileApi()

onMounted(loadProfile)
</script>

<template>
  <div class="max-w-lg mx-auto">
    <h2 class="text-2xl font-bold text-gray-900 mb-8">Profile</h2>

    <div
      v-if="message"
      class="mb-6 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700"
    >
      {{ message }}
    </div>
    <div
      v-if="error"
      class="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <ProfilePictureCard
      :has-profile-picture="hasProfilePicture"
      :picture-url="pictureUrl"
      :picture-key="pictureKey"
      :uploading="uploading"
      @upload="uploadPicture"
    />

    <DisplayNameCard
      v-model:display-name="displayName"
      :saved-name="savedName"
      :saving="saving"
      @save="saveDisplayName"
    />
  </div>
</template>
