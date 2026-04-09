<script setup>
import { shallowRef, ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'

const route = useRoute()
const router = useRouter()
const { authFetch } = useApi()

const eventId = route.params.id

// Event details (editable)
const form = ref({
  title: '',
  location: '',
  start: '',
  end: '',
  visibility: 0,
  joinMode: 0,
  capacity: null,
  cost: null
})
const saving = shallowRef(false)
const saveError = shallowRef(null)
const saveSuccess = shallowRef(false)

// Attendees
const attendees = ref([])
const coAdmins = ref([])
const loadingAttendees = shallowRef(true)
const attendeesError = shallowRef(null)

// Co-admin form
const newCoAdminEmail = ref('')
const addingCoAdmin = shallowRef(false)
const coAdminError = shallowRef(null)

// Event metadata
const eventData = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)

const hasCost = computed(() => eventData.value?.cost != null && eventData.value.cost > 0)

function toLocalDatetime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadEvent() {
  loading.value = true
  error.value = null
  try {
    const res = await authFetch(`/api/events/${eventId}`)
    const data = await res.json()
    eventData.value = data
    form.value = {
      title: data.title,
      location: data.location || '',
      start: toLocalDatetime(data.start),
      end: toLocalDatetime(data.end),
      visibility: data.visibility,
      joinMode: data.joinMode,
      capacity: data.capacity,
      cost: data.cost
    }
  } catch (err) {
    error.value = err.message || 'Failed to load event.'
  } finally {
    loading.value = false
  }
}

async function saveEvent() {
  saving.value = true
  saveError.value = null
  saveSuccess.value = false
  try {
    await authFetch(`/api/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.value.title,
        location: form.value.location,
        start: new Date(form.value.start).toISOString(),
        end: new Date(form.value.end).toISOString(),
        visibility: form.value.visibility,
        joinMode: form.value.joinMode,
        capacity: form.value.capacity || null,
        cost: form.value.cost || null
      })
    })
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (err) {
    saveError.value = err.message || 'Failed to save.'
  } finally {
    saving.value = false
  }
}

async function loadAttendees() {
  loadingAttendees.value = true
  attendeesError.value = null
  try {
    const res = await authFetch(`/api/events/${eventId}/attendees`)
    const data = await res.json()
    attendees.value = data.attendees
    coAdmins.value = data.coAdmins
  } catch (err) {
    attendeesError.value = err.message || 'Failed to load attendees.'
  } finally {
    loadingAttendees.value = false
  }
}

async function togglePaid(attendee) {
  try {
    await authFetch(`/api/events/${eventId}/attendees/${attendee.userId}/payment`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasPaid: !attendee.hasPaid })
    })
    attendee.hasPaid = !attendee.hasPaid
  } catch (err) {
    attendeesError.value = err.message || 'Failed to update payment.'
  }
}

async function addCoAdmin() {
  if (!newCoAdminEmail.value.trim()) return
  addingCoAdmin.value = true
  coAdminError.value = null
  try {
    const res = await authFetch(`/api/events/${eventId}/co-admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newCoAdminEmail.value.trim() })
    })
    const data = await res.json()
    coAdmins.value.push(data)
    newCoAdminEmail.value = ''
  } catch (err) {
    coAdminError.value = err.message || 'Failed to add co-admin.'
  } finally {
    addingCoAdmin.value = false
  }
}

async function removeCoAdmin(admin) {
  try {
    await authFetch(`/api/events/${eventId}/co-admins/${admin.userId}`, { method: 'DELETE' })
    coAdmins.value = coAdmins.value.filter(c => c.userId !== admin.userId)
  } catch (err) {
    coAdminError.value = err.message || 'Failed to remove co-admin.'
  }
}

onMounted(async () => {
  await loadEvent()
  if (!error.value) await loadAttendees()
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <button
      @click="router.push({ name: 'event', params: { id: eventId } })"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to event
    </button>

    <div v-if="loading" class="text-center py-16 text-gray-400">Loading...</div>

    <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <template v-else>
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Manage Event</h1>

      <!-- Edit Event Details -->
      <section class="bg-white shadow rounded-xl p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Event Details</h2>
        <form @submit.prevent="saveEvent" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input v-model="form.title" type="text" required
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <textarea v-model="form.location" rows="3"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input v-model="form.start" type="datetime-local" required
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input v-model="form.end" type="datetime-local" required
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
              <select v-model.number="form.visibility"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option :value="0">Public</option>
                <option :value="1">Unlisted</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Join Mode</label>
              <select v-model.number="form.joinMode"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <option :value="0">Open</option>
                <option :value="1">Invite only</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
              <input v-model.number="form.capacity" type="number" min="1" placeholder="Unlimited"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Cost</label>
              <input v-model.number="form.cost" type="number" min="0" step="0.01" placeholder="Free"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <button type="submit" :disabled="saving"
              class="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {{ saving ? 'Saving…' : 'Save Changes' }}
            </button>
            <span v-if="saveSuccess" class="text-sm text-green-600">Saved!</span>
            <span v-if="saveError" class="text-sm text-red-600">{{ saveError }}</span>
          </div>
        </form>
      </section>

      <!-- Co-Admins -->
      <section class="bg-white shadow rounded-xl p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">Co-Admins</h2>
        <div class="flex gap-2 mb-4">
          <input
            v-model="newCoAdminEmail"
            type="email"
            placeholder="Email address"
            class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            @keyup.enter="addCoAdmin"
          />
          <button
            :disabled="addingCoAdmin || !newCoAdminEmail.trim()"
            @click="addCoAdmin"
            class="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {{ addingCoAdmin ? 'Adding…' : 'Add' }}
          </button>
        </div>
        <div v-if="coAdminError" class="text-sm text-red-600 mb-3">{{ coAdminError }}</div>
        <div v-if="coAdmins.length === 0" class="text-sm text-gray-400">No co-admins yet.</div>
        <ul v-else class="divide-y divide-gray-100">
          <li v-for="admin in coAdmins" :key="admin.userId" class="flex items-center justify-between py-2.5">
            <div>
              <p class="text-sm font-medium text-gray-900">{{ admin.displayName }}</p>
              <p class="text-xs text-gray-500">{{ admin.email }}</p>
            </div>
            <button
              @click="removeCoAdmin(admin)"
              class="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Remove
            </button>
          </li>
        </ul>
      </section>

      <!-- Attendees -->
      <section class="bg-white shadow rounded-xl p-6">
        <h2 class="text-lg font-semibold text-gray-900 mb-4">
          Attendees
          <span class="text-sm font-normal text-gray-400 ml-1">({{ attendees.length }})</span>
        </h2>

        <div v-if="loadingAttendees" class="text-sm text-gray-400">Loading attendees...</div>
        <div v-else-if="attendeesError" class="text-sm text-red-600">{{ attendeesError }}</div>
        <div v-else-if="attendees.length === 0" class="text-sm text-gray-400">No attendees yet.</div>

        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
              <th class="pb-2 font-medium">Name</th>
              <th class="pb-2 font-medium">Joined</th>
              <th v-if="hasCost" class="pb-2 font-medium text-center">Paid</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="a in attendees" :key="a.userId">
              <td class="py-2.5">
                <p class="font-medium text-gray-900">{{ a.displayName }}</p>
                <p class="text-xs text-gray-500">{{ a.email }}</p>
              </td>
              <td class="py-2.5 text-gray-500">
                {{ new Date(a.joinedAt).toLocaleDateString() }}
              </td>
              <td v-if="hasCost" class="py-2.5 text-center">
                <button
                  @click="togglePaid(a)"
                  class="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 transition-colors"
                  :class="a.hasPaid
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'"
                >
                  {{ a.hasPaid ? 'Paid' : 'Unpaid' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>
