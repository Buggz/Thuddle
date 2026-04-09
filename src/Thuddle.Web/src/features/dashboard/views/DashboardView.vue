<script setup>
import { shallowRef, ref, onMounted, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'

const { authFetch } = useApi()
const auth = useAuthStore()

const events = ref([])
const loading = shallowRef(true)
const error = shallowRef(null)
const page = shallowRef(1)
const totalPages = shallowRef(1)

const hasPrev = computed(() => page.value > 1)
const hasNext = computed(() => page.value < totalPages.value)

async function loadEvents() {
  loading.value = true
  error.value = null
  try {
    const res = await authFetch(`/api/events?page=${page.value}&pageSize=12`)
    const data = await res.json()
    events.value = data.items
    totalPages.value = data.totalPages
  } catch (err) {
    error.value = err.message || 'Failed to load events.'
  } finally {
    loading.value = false
  }
}

function prevPage() {
  if (hasPrev.value) {
    page.value--
    loadEvents()
  }
}

function nextPage() {
  if (hasNext.value) {
    page.value++
    loadEvents()
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

onMounted(loadEvents)
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold text-gray-900">Events</h2>
    </div>

    <div v-if="loading" class="text-center py-12 text-gray-400">Loading events...</div>

    <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div v-else-if="events.length === 0" class="text-center py-12">
      <p class="text-gray-500 text-lg">No events yet.</p>
      <p v-if="auth.isAuthenticated" class="text-gray-400 text-sm mt-1">Create one to get started!</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <RouterLink
          v-for="event in events"
          :key="event.id"
          :to="{ name: 'event', params: { id: event.id } }"
          class="bg-white shadow rounded-lg p-5 flex flex-col hover:shadow-md transition-shadow"
        >
          <h3 class="text-lg font-semibold text-gray-900 mb-1">{{ event.title }}</h3>
          <p v-if="event.location" class="text-sm text-gray-500 mb-3 line-clamp-2">{{ event.location }}</p>
          <div class="mt-auto space-y-1 text-xs text-gray-400">
            <div class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <span>{{ formatDate(event.start) }} – {{ formatDate(event.end) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="event.visibility === 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
              >
                {{ event.visibility === 0 ? 'Public' : 'Unlisted' }}
              </span>
              <span
                class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                :class="event.joinMode === 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'"
              >
                {{ event.joinMode === 0 ? 'Open' : 'Invite only' }}
              </span>
              <span v-if="event.capacity" class="text-gray-400">
                Max {{ event.capacity }}
              </span>
              <span class="font-medium" :class="event.cost ? 'text-gray-700' : 'text-green-600'">
                {{ event.cost ? event.cost.toFixed(2) : 'Free' }}
              </span>
            </div>
          </div>
        </RouterLink>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-center gap-4 mt-8">
        <button
          :disabled="!hasPrev"
          @click="prevPage"
          class="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span class="text-sm text-gray-500">Page {{ page }} of {{ totalPages }}</span>
        <button
          :disabled="!hasNext"
          @click="nextPage"
          class="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </template>
  </div>
</template>
