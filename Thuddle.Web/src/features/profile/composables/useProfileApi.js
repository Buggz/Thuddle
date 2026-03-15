import { ref } from 'vue'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useProfileStore } from '@/features/profile/stores/profile'
import { apiUrl } from '@/api'

export function useProfileApi() {
  const { authFetch } = useApi()
  const auth = useAuthStore()
  const profile = useProfileStore()

  const displayName = ref('')
  const savedName = ref('')
  const saving = ref(false)
  const uploading = ref(false)
  const message = ref(null)
  const error = ref(null)
  const hasProfilePicture = ref(false)
  const pictureUrl = ref(null)

  async function loadProfile() {
    try {
      const res = await authFetch('/api/profile')
      const data = await res.json()
      displayName.value = data.displayName || ''
      savedName.value = data.displayName || ''
      hasProfilePicture.value = data.hasProfilePicture
      if (data.hasProfilePicture) {
        pictureUrl.value = apiUrl(`/api/profile/picture/${auth.keycloakId}?v=${profile.pictureVersion}`)
      }
    } catch {
      error.value = 'Failed to load profile.'
    }
  }

  async function saveDisplayName() {
    saving.value = true
    message.value = null
    error.value = null
    try {
      const res = await authFetch('/api/profile/displayname', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.value })
      })
      const data = await res.json()
      savedName.value = data.displayName
      message.value = 'Display name saved.'
    } catch {
      error.value = 'Failed to save display name.'
    } finally {
      saving.value = false
    }
  }

  async function uploadPicture(event) {
    const file = event.target.files?.[0]
    if (!file) return

    uploading.value = true
    message.value = null
    error.value = null

    const formData = new FormData()
    formData.append('picture', file)

    try {
      await authFetch('/api/profile/picture', {
        method: 'POST',
        body: formData
      })
      hasProfilePicture.value = true
      profile.bumpPictureVersion()
      pictureUrl.value = apiUrl(`/api/profile/picture/${auth.keycloakId}?v=${profile.pictureVersion}`)
      message.value = 'Profile picture uploaded.'
    } catch (err) {
      error.value = err.message || 'Failed to upload picture.'
    } finally {
      uploading.value = false
      event.target.value = ''
    }
  }

  return {
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
  }
}
