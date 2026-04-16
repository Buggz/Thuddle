<script setup>
import { shallowRef, ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'
import ImageCropper from '@/features/profile/components/ImageCropper.vue'
import Spinner from '@/shared/components/Spinner.vue'
import UserSearchComboBox from '@/shared/components/UserSearchComboBox.vue'

const route = useRoute()
const router = useRouter()
const { authFetch } = useApi()

const eventId = route.params.id
const activeTab = shallowRef('about')

// Event details (editable)
const form = ref({
  title: '',
  location: '',
  description: '',
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
const submitted = shallowRef(false)

// Event image
const selectedImageFile = ref(null)
const uploadingImage = shallowRef(false)
const imageError = shallowRef(null)

watch(() => form.value.visibility, (v) => {
  if (v === 1) form.value.joinMode = 1
})

/** Earliest selectable datetime (start of today, so 15-min steps align to :00/:15/:30/:45). */
const nowLocal = computed(() => {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00`
})

/** End picker cannot be earlier than the chosen start. */
const minEnd = computed(() => form.value.start || nowLocal.value)

const isFormValid = computed(() =>
  form.value.title?.trim().length > 0 &&
  form.value.location?.trim().length > 0 &&
  form.value.start &&
  form.value.end &&
  new Date(form.value.end) > new Date(form.value.start) &&
  new Date(form.value.start) > new Date()
)

const fieldErrors = computed(() => {
  if (!submitted.value) return {}
  const errs = {}
  if (!form.value.title?.trim()) errs.title = 'Title is required.'
  if (!form.value.location?.trim()) errs.location = 'Location is required.'
  if (!form.value.start) errs.start = 'Start date is required.'
  else if (new Date(form.value.start) <= new Date()) errs.start = 'Start must be in the future.'
  if (!form.value.end) errs.end = 'End date is required.'
  else if (form.value.start && new Date(form.value.end) <= new Date(form.value.start)) errs.end = 'End must be after start.'
  return errs
})

// Attendees
const attendees = ref([])
const pendingInvitations = ref([])
const coAdmins = ref([])
const loadingAttendees = shallowRef(true)
const attendeesError = shallowRef(null)

// Co-admin form
const addingCoAdmin = shallowRef(false)
const coAdminError = shallowRef(null)

// Discussion settings
const discussionSettings = ref({
  memberPostPolicy: 1,      // 0 = RequireApproval, 1 = AutoApprove
  nonMemberPostPolicy: 0,
  allowNonMemberPosts: false,
  allowNonMemberComments: false
})
const savingDiscussion = shallowRef(false)
const discussionSaveSuccess = shallowRef(false)
const discussionSaveError = shallowRef(null)

// Event metadata
const eventData = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)

const hasCost = computed(() => eventData.value?.cost != null && eventData.value.cost > 0)

// Invitation form state
const selectedInvitees = ref([])
const inviting = shallowRef(false)
const inviteError = shallowRef(null)
const inviteSuccess = shallowRef(false)

const excludedInviteEmails = computed(() => {
  const emails = selectedInvitees.value.map(i => i.email.toLowerCase())
  for (const a of attendees.value) emails.push(a.email.toLowerCase())
  for (const inv of pendingInvitations.value) emails.push(inv.email.toLowerCase())
  return emails
})

function onInviteeSelect(item) {
  const email = item.email.toLowerCase()
  if (selectedInvitees.value.some(i => i.email.toLowerCase() === email)) return
  selectedInvitees.value.push(item)
}

function removeSelectedInvitee(item) {
  selectedInvitees.value = selectedInvitees.value.filter(i => i.email !== item.email)
}

async function inviteUsers() {
  inviting.value = true
  inviteError.value = null
  inviteSuccess.value = false
  const emails = selectedInvitees.value.map(i => i.email.trim()).filter(e => e)
  if (emails.length === 0) {
    inviteError.value = 'Please add at least one user.'
    inviting.value = false
    return
  }
  try {
    await authFetch(`/api/events/${eventId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emails })
    })
    inviteSuccess.value = true
    setTimeout(() => { inviteSuccess.value = false }, 3000)
    selectedInvitees.value = []
    await loadAttendees()
  } catch (err) {
    inviteError.value = err.message || 'Failed to send invitations.'
  } finally {
    inviting.value = false
  }
}

function onImageFileChange(event) {
  const file = event.target.files?.[0]
  if (file) selectedImageFile.value = file
  event.target.value = ''
}

async function onImageCrop(blob) {
  selectedImageFile.value = null
  uploadingImage.value = true
  imageError.value = null
  try {
    const formData = new FormData()
    formData.append('picture', blob, 'event.jpg')
    const res = await authFetch(`/api/events/${eventId}/picture`, {
      method: 'POST',
      body: formData
    })
    const data = await res.json()
    if (eventData.value) eventData.value.picturePath = data.url
  } catch (err) {
    imageError.value = err.message || 'Failed to upload image.'
  } finally {
    uploadingImage.value = false
  }
}

function onImageCropCancel() {
  selectedImageFile.value = null
}

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
      description: data.description || '',
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
  submitted.value = true
  if (!isFormValid.value) return
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
        description: form.value.description,
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
    pendingInvitations.value = data.pendingInvitations || []
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

const excludedCoAdminEmails = computed(() => {
  return coAdmins.value.map(c => c.email.toLowerCase())
})

async function onCoAdminSelect(item) {
  if (item.type !== 'user') return
  addingCoAdmin.value = true
  coAdminError.value = null
  try {
    const res = await authFetch(`/api/events/${eventId}/co-admins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: item.email })
    })
    const data = await res.json()
    coAdmins.value.push(data)
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

async function uploadDescriptionImage(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await authFetch(`/api/events/${eventId}/images`, {
    method: 'POST',
    body: formData
  })
  const data = await res.json()
  return data.url
}

async function loadDiscussionSettings() {
  try {
    const res = await authFetch(`/api/events/${eventId}/discussion-settings`)
    const data = await res.json()
    discussionSettings.value = data
  } catch { /* ignore - uses defaults */ }
}

async function saveDiscussionSettings() {
  savingDiscussion.value = true
  discussionSaveError.value = null
  discussionSaveSuccess.value = false
  try {
    await authFetch(`/api/events/${eventId}/discussion-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discussionSettings.value)
    })
    discussionSaveSuccess.value = true
    setTimeout(() => { discussionSaveSuccess.value = false }, 3000)
  } catch (err) {
    discussionSaveError.value = err.message || 'Failed to save discussion settings.'
  } finally {
    savingDiscussion.value = false
  }
}

onMounted(async () => {
  await loadEvent()
  if (!error.value) {
    await Promise.all([loadAttendees(), loadDiscussionSettings()])
  }
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

      <!-- Tabs -->
      <div class="bg-white shadow rounded-xl overflow-hidden">
        <div class="border-b border-gray-100">
          <nav class="flex px-6" aria-label="Tabs">
            <button
              v-for="tab in [
                { key: 'about', label: 'About this event' },
                { key: 'discussion', label: 'Discussion' },
                { key: 'attendees', label: 'Attendees' },
                { key: 'coadmins', label: 'Co-Admins' }
              ]"
              :key="tab.key"
              :data-testid="`manage-tab-${tab.key}`"
              @click="activeTab = tab.key"
              class="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              :class="activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            >
              {{ tab.label }}
              <span v-if="tab.key === 'attendees'" class="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{{ attendees.length }}</span>
            </button>
          </nav>
        </div>

        <!-- Tab: About this event -->
        <div v-if="activeTab === 'about'" class="p-6">
          <!-- Event Image -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">Event image</label>
            <div v-if="eventData?.picturePath" class="mb-3">
              <img :src="eventData.picturePath" alt="Event image" class="rounded-lg max-h-48 object-cover" />
              <div class="flex gap-2 mt-2">
                <label class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition"
                  :class="{ 'opacity-50 pointer-events-none': uploadingImage }">
                  {{ uploadingImage ? 'Uploading...' : 'Change' }}
                  <input type="file" accept="image/*" class="hidden" @change="onImageFileChange" :disabled="uploadingImage" />
                </label>
              </div>
            </div>
            <div v-else>
              <label class="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg cursor-pointer hover:bg-gray-50 transition"
                :class="{ 'opacity-50 pointer-events-none': uploadingImage }">
                {{ uploadingImage ? 'Uploading...' : 'Upload image' }}
                <input type="file" accept="image/*" class="hidden" @change="onImageFileChange" :disabled="uploadingImage" />
              </label>
              <p class="mt-1.5 text-xs text-gray-400">PNG, JPG up to 10MB. Will be shown on the event card.</p>
            </div>
            <div v-if="imageError" class="mt-2 text-sm text-red-600">{{ imageError }}</div>
            <ImageCropper
              v-if="selectedImageFile"
              :image-file="selectedImageFile"
              shape="rectangle"
              :aspect-ratio="16/9"
              title="Crop Event Image"
              @crop="onImageCrop"
              @cancel="onImageCropCancel"
            />
          </div>

          <form @submit.prevent="saveEvent" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Title <span class="text-red-400">*</span></label>
              <input v-model="form.title" type="text" required
                data-testid="manage-title-input"
                :class="['w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500', fieldErrors.title ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']" />
              <p v-if="fieldErrors.title" data-testid="manage-title-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.title }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Location <span class="text-red-400">*</span></label>
              <textarea v-model="form.location" rows="3"
                data-testid="manage-location-input"
                :class="['w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500', fieldErrors.location ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']" />
              <p v-if="fieldErrors.location" data-testid="manage-location-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.location }}</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <RichTextEditor v-model="form.description" :upload-image="uploadDescriptionImage" />
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Start <span class="text-red-400">*</span></label>
                <input v-model="form.start" type="datetime-local" required
                  data-testid="manage-start-input"
                  step="900"
                  :min="nowLocal"
                  :class="['w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500', fieldErrors.start ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']" />
                <p v-if="fieldErrors.start" data-testid="manage-start-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.start }}</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">End <span class="text-red-400">*</span></label>
                <input v-model="form.end" type="datetime-local" required
                  data-testid="manage-end-input"
                  step="900"
                  :min="minEnd"
                  :class="['w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500', fieldErrors.end ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-indigo-500']" />
                <p v-if="fieldErrors.end" data-testid="manage-end-error" class="mt-1 text-xs text-red-600">{{ fieldErrors.end }}</p>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
                <select v-model.number="form.visibility"
                  data-testid="manage-visibility-select"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <option :value="0">Public</option>
                  <option :value="1">Unlisted</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Join Mode</label>
                <select v-model.number="form.joinMode"
                  :disabled="form.visibility === 1"
                  data-testid="manage-joinmode-select"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500">
                  <option :value="0">Open</option>
                  <option :value="1">Invite only</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                <input v-model.number="form.capacity" type="number" min="1" placeholder="Unlimited"
                  data-testid="manage-capacity-input"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Cost</label>
                <input v-model.number="form.cost" type="number" min="0" step="0.01" placeholder="Free"
                  data-testid="manage-cost-input"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            </div>

            <div class="flex items-center gap-3 pt-2">
              <button type="submit" :disabled="saving || !isFormValid"
                data-testid="manage-save-btn"
                class="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {{ saving ? 'Saving…' : 'Save Changes' }}
              </button>
              <span v-if="saveSuccess" data-testid="manage-save-success" class="text-sm text-green-600">Saved!</span>
              <span v-if="saveError" data-testid="manage-save-error" class="text-sm text-red-600">{{ saveError }}</span>
            </div>
          </form>
        </div>

        <!-- Tab: Discussion Settings -->
        <div v-if="activeTab === 'discussion'" class="p-6">
          <div class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Member posts</label>
                <select v-model.number="discussionSettings.memberPostPolicy"
                  data-testid="manage-member-post-policy"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                  <option :value="1">Post freely</option>
                  <option :value="0">Require approval</option>
                </select>
                <p class="mt-1 text-xs text-gray-400">Attendees who have joined the event</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Non-member posts</label>
                <select v-model.number="discussionSettings.nonMemberPostPolicy"
                  data-testid="manage-nonmember-post-policy"
                  :disabled="!discussionSettings.allowNonMemberPosts"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-500">
                  <option :value="1">Post freely</option>
                  <option :value="0">Require approval</option>
                </select>
                <p class="mt-1 text-xs text-gray-400">Users who haven't joined the event</p>
              </div>
            </div>
            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" v-model="discussionSettings.allowNonMemberPosts"
                  data-testid="manage-allow-nonmember-posts"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                Allow non-members to create posts
              </label>
              <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" v-model="discussionSettings.allowNonMemberComments"
                  data-testid="manage-allow-nonmember-comments"
                  class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                Allow non-members to comment
              </label>
            </div>
            <div class="flex items-center gap-3 pt-2">
              <button @click="saveDiscussionSettings" :disabled="savingDiscussion"
                data-testid="manage-save-discussion-btn"
                class="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {{ savingDiscussion ? 'Saving…' : 'Save Settings' }}
              </button>
              <span v-if="discussionSaveSuccess" data-testid="manage-discussion-save-success" class="text-sm text-green-600">Saved!</span>
              <span v-if="discussionSaveError" data-testid="manage-discussion-save-error" class="text-sm text-red-600">{{ discussionSaveError }}</span>
            </div>
          </div>
        </div>

        <!-- Tab: Attendees -->
        <div v-if="activeTab === 'attendees'" class="p-6">
          <div v-if="loadingAttendees" class="text-sm text-gray-400">Loading attendees...</div>
          <div v-else-if="attendeesError" class="text-sm text-red-600">{{ attendeesError }}</div>
          <div v-else-if="attendees.length === 0 && pendingInvitations.length === 0" data-testid="manage-attendees-empty" class="text-sm text-gray-400">No attendees yet.</div>

          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <th class="pb-2 font-medium">Display Name</th>
                <th class="pb-2 font-medium">Full Name</th>
                <th class="pb-2 font-medium">Email</th>
                <th class="pb-2 font-medium">Joined</th>
                <th v-if="hasCost" class="pb-2 font-medium text-center">Paid</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="a in attendees" :key="a.userId" data-testid="manage-attendee-row">
                <td class="py-2.5 font-medium text-gray-900">{{ a.displayName }}</td>
                <td class="py-2.5">
                  <span v-if="a.fullName" class="text-gray-700">{{ a.fullName }}</span>
                  <span v-else class="text-gray-400 italic cursor-default select-none" title="Will be updated next time the user logs in">(Not available)</span>
                </td>
                <td class="py-2.5 text-gray-500">{{ a.email }}</td>
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
              <tr v-for="inv in pendingInvitations" :key="'inv-' + inv.email" data-testid="manage-pending-invitation" class="opacity-60">
                <td class="py-2.5 font-medium text-gray-500 italic">—</td>
                <td class="py-2.5 text-gray-400">—</td>
                <td class="py-2.5 text-gray-500">{{ inv.email }}</td>
                <td class="py-2.5">
                  <span class="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    Invited
                  </span>
                </td>
                <td v-if="hasCost" class="py-2.5 text-center text-gray-400">—</td>
              </tr>
            </tbody>
          </table>

          <!-- Invite Users -->
          <div class="border-t border-gray-100 mt-6 pt-6">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Invite Users</h3>
            <UserSearchComboBox
              :allow-unknown-email="true"
              :exclude-emails="excludedInviteEmails"
              placeholder="Search by name or email…"
              @select="onInviteeSelect"
            />

            <!-- Selected invitees chips -->
            <div v-if="selectedInvitees.length" class="flex flex-wrap gap-2 mt-3" data-testid="manage-invite-chip-list">
              <span
                v-for="invitee in selectedInvitees"
                :key="invitee.email"
                data-testid="manage-invite-chip"
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
                :class="invitee.type === 'user'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'bg-amber-50 text-amber-700'"
              >
                <span class="truncate max-w-[200px]">{{ invitee.displayName || invitee.email }}</span>
                <button
                  type="button"
                  @click="removeSelectedInvitee(invitee)"
                  data-testid="manage-invite-chip-remove"
                  class="shrink-0 text-current opacity-60 hover:opacity-100"
                >✕</button>
              </span>
            </div>

            <div class="flex items-center gap-3 pt-3">
              <button @click="inviteUsers" :disabled="inviting || selectedInvitees.length === 0"
                data-testid="manage-invite-send-btn"
                class="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {{ inviting ? 'Inviting…' : `Invite ${selectedInvitees.length} user${selectedInvitees.length === 1 ? '' : 's'}` }}
              </button>
              <span v-if="inviteSuccess" data-testid="manage-invite-success" class="text-sm text-green-600">Invitations sent!</span>
              <span v-if="inviteError" data-testid="manage-invite-error" class="text-sm text-red-600">{{ inviteError }}</span>
            </div>
          </div>
        </div>

        <!-- Tab: Co-Admins -->
        <div v-if="activeTab === 'coadmins'" class="p-6">
          <UserSearchComboBox
            :allow-unknown-email="false"
            :exclude-emails="excludedCoAdminEmails"
            placeholder="Search for a co-admin by name or email…"
            @select="onCoAdminSelect"
          />
          <div v-if="addingCoAdmin" class="mt-2 text-sm text-gray-400">Adding…</div>
          <div v-if="coAdminError" class="text-sm text-red-600 mt-2 mb-3">{{ coAdminError }}</div>
          <div v-if="coAdmins.length === 0 && !addingCoAdmin" class="text-sm text-gray-400 mt-4">No co-admins yet.</div>
          <ul v-else class="divide-y divide-gray-100">
            <li v-for="admin in coAdmins" :key="admin.userId" class="flex items-center justify-between py-2.5">
              <div>
                <p class="text-sm font-medium text-gray-900">{{ admin.displayName }}</p>
                <p class="text-xs text-gray-500">
                  <span v-if="admin.fullName">{{ admin.fullName }}</span>
                  <span v-else class="text-gray-400 italic cursor-default select-none" title="Will be updated next time the user logs in">(Not available)</span>
                  · {{ admin.email }}
                </p>
              </div>
              <button
                @click="removeCoAdmin(admin)"
                class="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Remove
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </div>
</template>
