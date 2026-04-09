import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useProfileStore = defineStore('profile', () => {
  const pictureVersion = ref(0)

  function bumpPictureVersion() {
    pictureVersion.value++
  }

  return {
    pictureVersion,
    bumpPictureVersion
  }
})
