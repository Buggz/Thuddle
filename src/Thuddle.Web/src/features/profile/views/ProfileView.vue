<script setup>
import { onMounted } from 'vue'
import { useProfileApi } from '@/features/profile/composables/useProfileApi'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import ProfilePictureCard from '@/features/profile/components/ProfilePictureCard.vue'
import DisplayNameCard from '@/features/profile/components/DisplayNameCard.vue'

const permissionsStore = usePermissionsStore()

const {
  displayName,
  savedName,
  saving,
  uploading,
  message,
  error,
  hasProfilePicture,
  pictureUrl,
  loadProfile,
  saveDisplayName,
  uploadPicture
} = useProfileApi()

async function handleSaveDisplayName() {
  await saveDisplayName()
  if (savedName.value) {
    permissionsStore.updateDisplayName(savedName.value)
  }
}

async function handleUploadPicture(blob) {
  await uploadPicture(blob)
  if (pictureUrl.value) {
    permissionsStore.markProfilePictureUploaded(pictureUrl.value)
  }
}

onMounted(loadProfile)
</script>

<template>
  <div class="max-w-lg mx-auto">
    <h2 data-testid="profile-heading" class="text-2xl font-bold text-gray-900 mb-8">Profile</h2>

    <div
      v-if="message"
      data-testid="profile-success-msg"
      class="mb-6 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700"
    >
      {{ message }}
    </div>
    <div
      v-if="error"
      data-testid="profile-error-msg"
      class="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {{ error }}
    </div>

    <ProfilePictureCard
      :has-profile-picture="hasProfilePicture"
      :picture-url="pictureUrl"
      :uploading="uploading"
      @upload="handleUploadPicture"
    />

    <DisplayNameCard
      v-model:display-name="displayName"
      :saved-name="savedName"
      :saving="saving"
      @save="handleSaveDisplayName"
    />
  </div>
</template>
