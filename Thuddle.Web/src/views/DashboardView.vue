<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const apiMessage = ref(null)
const error = ref(null)

async function fetchHello() {
  try {
    const response = await fetch('/api/hello', {
      headers: {
        Authorization: `Bearer ${auth.getToken()}`
      }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    apiMessage.value = await response.json()
  } catch (err) {
    error.value = err.message
  }
}

onMounted(fetchHello)
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>
    <div class="bg-white shadow rounded-lg p-6">
      <h3 class="text-lg font-medium text-gray-900 mb-2">API Response</h3>
      <div v-if="error" class="text-red-600">Error: {{ error }}</div>
      <div v-else-if="apiMessage" class="text-green-600">
        {{ apiMessage.message }}
      </div>
      <div v-else class="text-gray-400">Loading...</div>
    </div>
  </div>
</template>
