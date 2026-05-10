<script setup>
import { shallowRef, ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useApi } from '@/shared/composables/useApi'
import { useInlineImageUpload } from '@/shared/composables/useInlineImageUpload'
import { auctionApi } from '@/api'
import EventForm from '@/features/events/components/EventForm.vue'
import ImageCropper from '@/features/profile/components/ImageCropper.vue'
import UserSearchComboBox from '@/shared/components/UserSearchComboBox.vue'
import GroupSelectorPopover from '@/features/groups/components/GroupSelectorPopover.vue'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { useFeatureFlags } from '@/shared/featureFlags'
import { useEventsStore } from '@/features/events/stores/events'
import KickAttendeeDialog from '@/features/events/components/KickAttendeeDialog.vue'
import RafflesSection from '@/features/events/raffles/RafflesSection.vue'
import ManageActivitiesSection from '@/features/events/activities/ManageActivitiesSection.vue'
import EventTabBar from '@/features/events/components/EventTabBar.vue'
import EventFeaturesManager from '@/features/events/components/EventFeaturesManager.vue'
import { useEventFeaturesStore } from '@/features/events/stores/eventFeatures'
import { EVENT_FEATURES, FeatureKeys } from '@/features/events/featureCatalog'

const route = useRoute()
const router = useRouter()
const { authFetch } = useApi()
const permissionsStore = usePermissionsStore()
const eventsStore = useEventsStore()
const { auctions: auctionsEnabled } = useFeatureFlags()
const eventFeaturesStore = useEventFeaturesStore()

// slug from URL; eventId (GUID) resolved after first load
const slug = route.params.slug
const eventId = shallowRef(null)
const { uploadImage } = useInlineImageUpload(eventId)
const activeTab = shallowRef('about')

const manageTabs = computed(() => {
  const base = [
    { key: 'about', label: 'About', testid: 'manage-tab-about' },
    { key: 'features', label: 'Features', testid: 'manage-tab-features' },
    { key: 'discussion', label: 'Discussion', testid: 'manage-tab-discussion' },
    { key: 'attendees', label: 'Attendees', testid: 'manage-tab-attendees' },
    { key: 'coadmins', label: 'Co-Admins', testid: 'manage-tab-coadmins' }
  ]
  for (const meta of EVENT_FEATURES) {
    if (meta.key === FeatureKeys.Auction && !auctionsEnabled.value) continue
    if (eventFeaturesStore.isEnabled(eventId.value, meta.key)) {
      base.push({ key: meta.key, label: meta.label, icon: meta.icon, testid: `manage-tab-${meta.key}` })
    }
  }
  return base
})

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
  cost: null,
  currency: 'EUR'
})
const saving = shallowRef(false)
const saveError = shallowRef(null)
const saveSuccess = shallowRef(false)
const submitted = shallowRef(false)
const eventFormRef = ref(null)

// Event image
const selectedImageFile = ref(null)
const uploadingImage = shallowRef(false)
const imageError = shallowRef(null)

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
const discussionSettingsLoaded = shallowRef(false)

// Event metadata
const eventData = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)

// Auction
const auctionSettings = ref(null)
const auctionLoading = shallowRef(true)
const auctionError = shallowRef(null)
const auctionConfigured = computed(() =>
  !!auctionSettings.value && auctionSettings.value.configured !== false
)
const auctionEnabled = computed(() =>
  auctionConfigured.value && auctionSettings.value?.enabled === true
)
const auctionStatus = computed(() => auctionSettings.value?.status || null)
const auctionStatusBadgeClass = computed(() => {
  switch (auctionStatus.value) {
    case 'Live': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'Scheduled': return 'bg-sky-50 text-sky-700 border-sky-200'
    case 'Ended': return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'Draft':
    default: return 'bg-amber-50 text-amber-700 border-amber-200'
  }
})

const hasCost = computed(() => eventData.value?.cost != null && eventData.value.cost > 0)

const eventOwnerId = computed(() => eventData.value?.ownerId ?? null)

const coAdminUserIds = computed(() => new Set(coAdmins.value.map(c => c.userId)))

// Kick attendee dialog
const kickDialogOpen = ref(false)
const kickTarget = ref(null)

function openKickDialog(attendee) {
  kickTarget.value = attendee
  kickDialogOpen.value = true
}

async function confirmKick({ revokeInvitation, denyReentry }) {
  if (!kickTarget.value) return
  const targetId = kickTarget.value.userId
  try {
    await eventsStore.kickAttendee(eventId.value, targetId, { revokeInvitation, denyReentry })
    attendees.value = attendees.value.filter(a => a.userId !== targetId)
  } catch (err) {
    attendeesError.value = err.message || 'Failed to remove attendee.'
  } finally {
    kickDialogOpen.value = false
    kickTarget.value = null
  }
}

// Rescind pending invitations
const rescindingEmails = ref(new Set())
async function rescindInvitation(email) {
  if (!email || rescindingEmails.value.has(email)) return
  if (!window.confirm(`Rescind the invitation for ${email}?`)) return
  const next = new Set(rescindingEmails.value)
  next.add(email)
  rescindingEmails.value = next
  try {
    await eventsStore.rescindInvitation(eventId.value, email)
    pendingInvitations.value = pendingInvitations.value.filter(i => i.email !== email)
  } catch (err) {
    attendeesError.value = err.message || 'Failed to rescind invitation.'
  } finally {
    const after = new Set(rescindingEmails.value)
    after.delete(email)
    rescindingEmails.value = after
  }
}

// Invitation form state
const selectedInvitees = ref([])
const inviting = shallowRef(false)
const inviteError = shallowRef(null)
const inviteSuccess = shallowRef(false)

// Groups integration
const groupPopoverFor = ref(null) // null | 'all' | userId
const groupToastMsg = shallowRef(null)
let groupToastTimer = null
function showGroupToast(msg) {
  groupToastMsg.value = msg
  clearTimeout(groupToastTimer)
  groupToastTimer = setTimeout(() => { groupToastMsg.value = null }, 3500)
}
const attendeeUserIds = computed(() => attendees.value.map(a => a.userId))
function popoverUserIds() {
  if (groupPopoverFor.value === 'all') return attendeeUserIds.value
  if (!groupPopoverFor.value) return []
  return [groupPopoverFor.value]
}
function onGroupAdded({ group, added, skipped, wasCreated }) {
  const picked = groupPopoverFor.value
  groupPopoverFor.value = null
  if (wasCreated) {
    showGroupToast(`Created “${group.name}” with ${added} ${added === 1 ? 'person' : 'people'}.`)
  } else if (added === 0) {
    showGroupToast(picked === 'all' ? `Everyone was already in “${group.name}”.` : `Already in “${group.name}”.`)
  } else if (skipped > 0) {
    showGroupToast(`Added ${added} to “${group.name}” (${skipped} already in).`)
  } else {
    showGroupToast(`Added ${added} to “${group.name}”.`)
  }
}

const excludedInviteEmails = computed(() => {
  const emails = selectedInvitees.value.map(i => i.email.toLowerCase())
  for (const a of attendees.value) emails.push(a.email.toLowerCase())
  for (const inv of pendingInvitations.value) emails.push(inv.email.toLowerCase())
  return emails
})

function onInviteeSelect(item) {
  if (item.type === 'group') {
    // Explode group into individual user chips so the host can see/remove members
    const existing = new Set(selectedInvitees.value.map(i => i.email.toLowerCase()))
    const excluded = new Set(excludedInviteEmails.value)
    for (const m of item.members || []) {
      const email = (m.email || '').toLowerCase()
      if (!email) continue
      if (existing.has(email) || excluded.has(email)) continue
      selectedInvitees.value.push({
        type: 'user',
        id: m.userId,
        email: m.email,
        displayName: m.displayName,
        fromGroup: item.name
      })
      existing.add(email)
    }
    return
  }
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
    await authFetch(`/api/events/${eventId.value}/invitations`, {
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
    const res = await authFetch(`/api/events/${eventId.value}/picture`, {
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
    const res = await authFetch(`/api/events/by-slug/${encodeURIComponent(slug)}`)
    const data = await res.json()
    eventId.value = data.id
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
      cost: data.cost,
      currency: data.currency || 'EUR'
    }
  } catch (err) {
    error.value = err.message || 'Failed to load event.'
  } finally {
    loading.value = false
  }
}

async function saveEvent() {
  submitted.value = true
  if (!eventFormRef.value?.isValid) return
  saving.value = true
  saveError.value = null
  saveSuccess.value = false
  try {
    await authFetch(`/api/events/${eventId.value}`, {
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
        cost: form.value.cost || null,
        currency: form.value.currency || 'EUR'
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
    const res = await authFetch(`/api/events/${eventId.value}/attendees`)
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
    await authFetch(`/api/events/${eventId.value}/attendees/${attendee.userId}/payment`, {
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
    const res = await authFetch(`/api/events/${eventId.value}/co-admins`, {
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
    await authFetch(`/api/events/${eventId.value}/co-admins/${admin.userId}`, { method: 'DELETE' })
    coAdmins.value = coAdmins.value.filter(c => c.userId !== admin.userId)
  } catch (err) {
    coAdminError.value = err.message || 'Failed to remove co-admin.'
  }
}



async function loadDiscussionSettings() {
  try {
    const res = await authFetch(`/api/events/${eventId.value}/discussion-settings`)
    const data = await res.json()
    discussionSettings.value = data
  } catch { /* ignore - uses defaults */ }
  finally { discussionSettingsLoaded.value = true }
}

async function loadAuctionSettings() {
  auctionLoading.value = true
  auctionError.value = null
  try {
    auctionSettings.value = await auctionApi.getSettings(authFetch, eventId.value)
  } catch (err) {
    // Hide gracefully — never crash the page if the auction endpoint is unavailable.
    auctionSettings.value = { configured: false }
    auctionError.value = err.message || 'Failed to load auction settings.'
  } finally {
    auctionLoading.value = false
  }
}

function goToAuctionSettings() {
  router.push({ name: 'auction-settings', params: { slug } })
}

function goToAuctionView() {
  router.push({ name: 'auction', params: { slug } })
}

async function saveDiscussionSettings() {
  savingDiscussion.value = true
  discussionSaveError.value = null
  discussionSaveSuccess.value = false
  try {
    await authFetch(`/api/events/${eventId.value}/discussion-settings`, {
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
  // Side-effect: subscribes the SignalR connection to event:{eventId} so realtime broadcasts (raffles, auctions, participants, etc.) reach this view.
  await loadEvent()
  if (!error.value && eventId.value) {
    eventsStore.loadEvent(eventId.value)
    await Promise.all([
      loadAttendees(),
      loadDiscussionSettings(),
      eventFeaturesStore.fetchFeatures(eventId.value).catch(() => { /* best-effort */ }),
      ...(auctionsEnabled.value ? [loadAuctionSettings()] : [])
    ])
  }
})

onUnmounted(() => {
  eventsStore.releaseEvent(eventId.value)
})

// If the active tab is a feature tab and that feature gets disabled live
// (EventFeatureDisabled arrives), fall back to About.
watch(manageTabs, (tabs) => {
  const keys = tabs.map((t) => t.key)
  if (!keys.includes(activeTab.value)) {
    activeTab.value = 'about'
  }
})
</script>

<template>
  <div class="max-w-4xl mx-auto">
    <button
      @click="router.push({ name: 'event', params: { slug } })"
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
        <div class="border-b border-gray-100 px-6 py-4">
          <EventTabBar
            :tabs="manageTabs"
            :active-key="activeTab"
            @update:active-key="(k) => activeTab = k"
          >
            <template #badge="{ tab }">
              <span
                v-if="tab.key === 'attendees'"
                class="ml-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
              >{{ attendees.length }}</span>
            </template>
          </EventTabBar>
        </div>

        <!-- Tab: Features -->
        <div v-if="activeTab === 'features'" class="p-6" data-testid="manage-features-tab">
          <EventFeaturesManager :event-id="eventId" />
        </div>

        <!-- Tab: About this event -->
        <div v-if="activeTab === 'about'" class="p-6">
          <!-- Event Image -->
          <div class="mb-6">
            <label class="block text-sm font-medium text-gray-700 mb-2">Event image</label>
            <div v-if="eventData?.picturePath" class="mb-3">
              <img :src="eventData.picturePath" alt="Event image" data-testid="manage-event-image" class="rounded-lg max-h-48 object-cover" />
              <div class="flex gap-2 mt-2">
                <label class="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition"
                  :class="{ 'opacity-50 pointer-events-none': uploadingImage }">
                  {{ uploadingImage ? 'Uploading...' : 'Change' }}
                  <input type="file" accept="image/*" class="hidden" data-testid="manage-event-image-input" @change="onImageFileChange" :disabled="uploadingImage" />
                </label>
              </div>
            </div>
            <div v-else>
              <label class="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg cursor-pointer hover:bg-gray-50 transition"
                :class="{ 'opacity-50 pointer-events-none': uploadingImage }">
                {{ uploadingImage ? 'Uploading...' : 'Upload image' }}
                <input type="file" accept="image/*" class="hidden" data-testid="manage-event-image-input" @change="onImageFileChange" :disabled="uploadingImage" />
              </label>
              <p class="mt-1.5 text-xs text-gray-400">PNG, JPG up to 10MB. Will be shown on the event card.</p>
            </div>
            <div v-if="imageError" data-testid="manage-event-image-error" class="mt-2 text-sm text-red-600">{{ imageError }}</div>
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
            <EventForm
              ref="eventFormRef"
              v-model="form"
              :submitted="submitted"
              test-id-prefix="manage"
              :upload-image="uploadImage"
              :show-cost="true"
            />

            <div class="flex items-center gap-3 pt-2">
              <button type="submit" :disabled="saving || !eventFormRef?.isValid"
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
          <div v-if="!discussionSettingsLoaded" data-testid="manage-discussion-loading" class="text-xs font-bold tracking-wider uppercase text-slate-400 flex items-center justify-center py-12">Loading discussion settings...</div>
          <div v-else class="space-y-4">
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
          <div v-if="loadingAttendees" class="text-xs font-bold tracking-wider uppercase text-slate-400 flex items-center justify-center py-12">Loading attendees...</div>
          <div v-else-if="attendeesError" class="text-sm font-medium text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">{{ attendeesError }}</div>
          
          <div v-else-if="attendees.length === 0 && pendingInvitations.length === 0" data-testid="manage-attendees-empty" class="text-center py-16 px-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
             <div class="mx-auto w-16 h-16 rounded-full bg-slate-100 border border-slate-200/60 shadow-sm flex items-center justify-center mb-4">
                <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
             </div>
             <h3 class="text-sm font-bold text-slate-900 mb-1">No attendees yet</h3>
             <p class="text-xs text-slate-500 max-w-[200px] mx-auto leading-relaxed">When people join your event or are invited, they'll appear here.</p>
          </div>

          <template v-else>
            <div class="flex items-center justify-between mb-4">
              <span class="text-[11px] font-bold tracking-wider uppercase text-slate-400">{{ attendees.length }} {{ attendees.length === 1 ? 'attendee' : 'attendees' }}</span>
              <div class="relative" v-if="attendees.length > 0 && permissionsStore.hasPermission('groups:manage')">
                <button
                  type="button"
                  data-testid="manage-save-attendees-as-group-btn"
                  @click="groupPopoverFor = groupPopoverFor === 'all' ? null : 'all'"
                  class="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50/80 border border-indigo-100/50 rounded-lg shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors hover:bg-indigo-100/80 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                  Save list as group
                </button>
                <div v-if="groupPopoverFor === 'all'" class="absolute right-0 mt-1.5 z-40">
                  <GroupSelectorPopover
                    v-if="permissionsStore.hasPermission('groups:manage')"
                    :user-ids="popoverUserIds()"
                    title="Add everyone to group"
                    @added="onGroupAdded"
                    @close="groupPopoverFor = null"
                  />
                </div>
              </div>
            </div>

            <div
              v-if="groupToastMsg"
              data-testid="manage-group-toast"
              class="mb-4 rounded-xl bg-slate-800 text-white text-[13px] font-medium px-4 py-2.5 shadow-lg shadow-slate-900/20 inline-flex items-center gap-2"
            >
              <svg class="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {{ groupToastMsg }}
            </div>

            <div class="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table class="w-full text-sm">
            <thead class="bg-slate-50/50">
              <tr class="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th class="px-4 py-3">Display Name</th>
                <th class="px-4 py-3">Full Name</th>
                <th class="px-4 py-3">Email</th>
                <th class="px-4 py-3">Joined</th>
                <th v-if="hasCost" class="px-4 py-3 text-center">Paid</th>              <th class="px-4 py-3 w-20"></th>                <th v-if="permissionsStore.hasPermission('groups:manage')" class="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              <tr v-for="a in attendees" :key="a.userId" data-testid="manage-attendee-row" class="group/row hover:bg-slate-50/50 transition-colors">
                <td class="px-4 py-3 font-semibold text-slate-900">{{ a.displayName }}</td>
                <td class="px-4 py-3">
                  <span v-if="a.fullName" class="text-slate-700">{{ a.fullName }}</span>
                  <span v-else class="text-slate-400 text-xs italic cursor-default select-none" title="Will be updated next time the user logs in">(Not available)</span>
                </td>
                <td class="px-4 py-3 text-slate-500 text-xs">{{ a.email }}</td>
                <td class="px-4 py-3 text-slate-500 text-xs font-medium">
                  {{ new Date(a.joinedAt).toLocaleDateString() }}
                </td>
                <td v-if="hasCost" class="px-4 py-3 text-center">
                  <button
                    @click="togglePaid(a)"
                    data-testid="manage-payment-toggle-btn"
                    class="inline-flex items-center justify-center gap-1.5 w-[88px] px-3 py-1 text-xs font-bold rounded-lg ring-1 ring-inset shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-95"
                    :class="a.hasPaid
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/30 hover:bg-emerald-100 focus:ring-emerald-600'
                      : 'bg-amber-50 text-amber-700 ring-amber-600/30 hover:bg-amber-100 focus:ring-amber-500'"
                    :title="a.hasPaid ? 'Click to mark as Unpaid' : 'Click to mark as Paid'"
                  >
                    <svg v-if="a.hasPaid" class="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <svg v-else class="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ a.hasPaid ? 'Paid' : 'Unpaid' }}
                  </button>
                </td>
                <td class="px-4 py-3 text-right">
                  <button
                    v-if="a.userId !== eventOwnerId && !coAdminUserIds.has(a.userId)"
                    :data-testid="`manage-kick-btn-${a.userId}`"
                    @click="openKickDialog(a)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100"
                  >
                    Remove
                  </button>
                </td>
                <td v-if="permissionsStore.hasPermission('groups:manage')" class="px-4 py-3 text-right relative">
                  <button
                    type="button"
                    :data-testid="`manage-attendee-add-to-group-btn`"
                    :data-user-id="a.userId"
                    @click="groupPopoverFor = groupPopoverFor === a.userId ? null : a.userId"
                    :title="`Add ${a.displayName} to a contact group`"
                    class="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 hover:shadow-sm opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-all"
                    :class="{ 'opacity-100 text-indigo-600 bg-indigo-50 shadow-sm': groupPopoverFor === a.userId }"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </button>
                  <div v-if="groupPopoverFor === a.userId" class="absolute right-6 mt-1 z-40">
                    <GroupSelectorPopover
                      v-if="permissionsStore.hasPermission('groups:manage')"
                      :user-ids="[a.userId]"
                      :title="`Add ${a.displayName}`"
                      @added="onGroupAdded"
                      @close="groupPopoverFor = null"
                    />
                  </div>
                </td>
              </tr>
              <tr v-for="inv in pendingInvitations" :key="'inv-' + inv.email" data-testid="manage-pending-invitation" class="bg-slate-50/30">
                <td class="px-4 py-3 font-medium text-slate-400 italic text-xs">—</td>
                <td class="px-4 py-3 text-slate-300 text-xs">—</td>
                <td class="px-4 py-3 text-slate-500 text-xs opacity-70">{{ inv.email }}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100/50">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    Invited
                  </span>
                </td>
                <td v-if="hasCost" class="px-4 py-3 text-center text-slate-300 text-xs">—</td>
                <td class="px-4 py-3 text-right">
                  <button
                    :data-testid="`manage-rescind-invitation-btn-${inv.email}`"
                    @click="rescindInvitation(inv.email)"
                    :disabled="rescindingEmails.has(inv.email)"
                    class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    :title="`Rescind invitation for ${inv.email}`"
                  >
                    {{ rescindingEmails.has(inv.email) ? 'Rescinding…' : 'Rescind' }}
                  </button>
                </td>
                <td class="px-4 py-3"></td>
              </tr>
            </tbody>
          </table>
          </div>
          </template>

          <!-- Invite Users -->
          <div class="border-t border-gray-100 mt-6 pt-6">
            <h3 class="text-base font-semibold text-gray-900 mb-4">Invite Users</h3>
            <UserSearchComboBox
              :allow-unknown-email="true"
              :exclude-emails="excludedInviteEmails"
              :include-groups="permissionsStore.hasPermission('groups:manage')"
              placeholder="Search people, groups, or type an email…"
              @select="onInviteeSelect"
            />

            <!-- Selected invitees chips -->
            <div v-if="selectedInvitees.length" class="flex flex-wrap gap-2 mt-3" data-testid="manage-invite-chip-list">
              <span
                v-for="invitee in selectedInvitees"
                :key="invitee.email"
                data-testid="manage-invite-chip"
                :data-from-group="invitee.fromGroup || undefined"
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm"
                :class="invitee.type === 'user'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'bg-amber-50 text-amber-700'"
              >
                <span class="truncate max-w-[200px]">{{ invitee.displayName || invitee.email }}</span>
                <span v-if="invitee.fromGroup" class="text-[10px] uppercase tracking-wide opacity-60">· {{ invitee.fromGroup }}</span>
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
          <div v-if="addingCoAdmin" data-testid="manage-coadmin-adding" class="mt-2 text-sm text-gray-400">Adding…</div>
          <div v-if="coAdminError" data-testid="manage-coadmin-error" class="text-sm text-red-600 mt-2 mb-3">{{ coAdminError }}</div>
          <div v-if="coAdmins.length === 0 && !addingCoAdmin" data-testid="manage-coadmin-empty" class="text-sm text-gray-400 mt-4">No co-admins yet.</div>
          <ul v-else data-testid="manage-coadmin-list" class="divide-y divide-gray-100">
            <li v-for="admin in coAdmins" :key="admin.userId" data-testid="manage-coadmin-row" class="flex items-center justify-between py-2.5">
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
                data-testid="manage-coadmin-remove-btn"
                class="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Remove
              </button>
            </li>
          </ul>
        </div>

        <!-- Tab: Auction -->
        <div v-if="activeTab === 'auction'" class="p-6" data-testid="manage-auction-tab">
          <div v-if="auctionLoading" class="text-sm text-gray-400">Loading auction…</div>

          <template v-else>
            <!-- Not configured / not enabled → setup CTA -->
            <div v-if="!auctionEnabled" class="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center">
              <div class="mx-auto w-12 h-12 rounded-full bg-white border border-indigo-200/60 shadow-sm flex items-center justify-center mb-3">
                <span class="text-2xl" aria-hidden="true">🔨</span>
              </div>
              <h3 class="text-sm font-bold text-gray-900 mb-1">Silent auction</h3>
              <p class="text-xs text-gray-600 max-w-sm mx-auto leading-relaxed mb-4">
                Raise funds or just have fun — let attendees submit items and bid against each other in real time.
              </p>
              <button
                type="button"
                data-testid="manage-auction-setup-btn"
                @click="goToAuctionSettings"
                class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Set up silent auction
              </button>
              <p v-if="auctionError" class="mt-3 text-xs text-red-600">{{ auctionError }}</p>
            </div>

            <!-- Configured + enabled → status panel -->
            <div v-else class="space-y-4">
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                    <span class="text-lg" aria-hidden="true">🔨</span>
                  </div>
                  <div>
                    <h3 class="text-sm font-bold text-gray-900">Silent auction</h3>
                    <p class="text-xs text-gray-500">Manage settings or jump into the auction.</p>
                  </div>
                </div>
                <span
                  data-testid="manage-auction-status-badge"
                  class="inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md border"
                  :class="auctionStatusBadgeClass"
                >
                  {{ auctionStatus || 'Draft' }}
                </span>
              </div>

              <div class="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  data-testid="manage-auction-settings-btn"
                  @click="goToAuctionSettings"
                  class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Auction settings
                </button>
                <button
                  type="button"
                  data-testid="manage-auction-view-btn"
                  @click="goToAuctionView"
                  class="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  View auction
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Tab: Raffles -->
        <div v-if="activeTab === 'raffles'" class="p-6" data-testid="manage-raffles-tab">
          <RafflesSection
            :event-id="eventId"
            :event-slug="slug"
            :is-host="true"
            :can-author="true"
            :currency="eventData?.currency || form.currency || ''"
          />
        </div>

        <!-- Tab: Activities -->
        <div v-if="activeTab === 'activities'" class="p-6" data-testid="manage-activities-tab">
          <ManageActivitiesSection :event-id="eventId" />
        </div>
      </div>
    </template>
  </div>

  <KickAttendeeDialog
    :open="kickDialogOpen"
    :attendee-name="kickTarget?.displayName || kickTarget?.email || ''"
    :event-join-mode="eventData?.joinMode ?? 0"
    @confirm="confirmKick"
    @cancel="() => { kickDialogOpen = false; kickTarget = null }"
  />
</template>
