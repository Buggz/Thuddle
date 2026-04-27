import { isRef } from 'vue'
import { useApi } from '@/shared/composables/useApi'

export function useInlineImageUpload(eventId) {
  const { authFetch } = useApi()

  async function uploadImage(file) {
    const id = typeof eventId === 'function' ? eventId() : isRef(eventId) ? eventId.value : eventId
    const formData = new FormData()
    formData.append('file', file)
    const res = await authFetch(`/api/events/${id}/images`, {
      method: 'POST',
      body: formData
    })
    const data = await res.json()
    return data.url
  }

  return { uploadImage }
}
