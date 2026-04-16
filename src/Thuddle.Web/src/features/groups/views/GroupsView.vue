<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGroupsApi } from '@/features/groups/composables/useGroupsApi'
import UserSearchComboBox from '@/shared/components/UserSearchComboBox.vue'
import EditableTitle from '@/shared/components/EditableTitle.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

const {
  groups,
  loaded,
  load,
  createGroup,
  renameGroup,
  deleteGroup,
  addMembers,
  removeMember
} = useGroupsApi()

const selectedId = ref(null)
const newGroupName = ref('')
const creating = ref(false)
const error = ref(null)
const toast = ref(null)
let toastTimer = null

const confirmDelete = ref(null) // group object

const selected = computed(() =>
  groups.value.find(g => g.id === selectedId.value) || null
)

const excludedEmails = computed(() =>
  (selected.value?.members || []).map(m => m.email.toLowerCase())
)

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3500)
}

onMounted(async () => {
  await load()
  if (!selectedId.value && groups.value.length) {
    selectedId.value = groups.value[0].id
  }
})

async function onCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  creating.value = true
  error.value = null
  try {
    const created = await createGroup(name, [])
    newGroupName.value = ''
    selectedId.value = created.id
    showToast(`Created group “${name}”`)
  } catch (err) {
    error.value = err.message || 'Failed to create group.'
  } finally {
    creating.value = false
  }
}

async function onRename(name) {
  if (!selected.value) return
  try {
    await renameGroup(selected.value.id, name)
    showToast('Renamed.')
  } catch (err) {
    error.value = err.message || 'Failed to rename group.'
  }
}

async function onDelete() {
  if (!confirmDelete.value) return
  const id = confirmDelete.value.id
  const name = confirmDelete.value.name
  confirmDelete.value = null
  try {
    await deleteGroup(id)
    if (selectedId.value === id) {
      selectedId.value = groups.value[0]?.id || null
    }
    showToast(`Deleted “${name}”.`)
  } catch (err) {
    error.value = err.message || 'Failed to delete group.'
  }
}

async function onUserSelected(item) {
  if (item.type !== 'user' || !selected.value) return
  try {
    const result = await addMembers(selected.value.id, [item.id])
    if (result.added > 0) {
      showToast(`Added ${item.displayName || item.email}.`)
    } else {
      showToast('Already in this group.')
    }
  } catch (err) {
    error.value = err.message || 'Failed to add member.'
  }
}

async function onRemoveMember(member) {
  if (!selected.value) return
  try {
    await removeMember(selected.value.id, member.userId)
    showToast(`Removed ${member.displayName}.`)
  } catch (err) {
    error.value = err.message || 'Failed to remove member.'
  }
}

function userInitials(m) {
  const name = m.displayName || m.email
  return name.slice(0, 2).toUpperCase()
}
</script>

<template>
  <div class="max-w-5xl mx-auto">
    <div class="flex items-baseline justify-between mb-6">
      <h1 data-testid="groups-heading" class="text-2xl font-bold text-gray-900">Contact Groups</h1>
      <p class="text-sm text-gray-400">Keep lists of people you invite often.</p>
    </div>

    <div
      v-if="toast"
      data-testid="groups-toast"
      class="fixed top-6 right-6 z-50 rounded-xl bg-gray-900 text-white text-sm px-4 py-2.5 shadow-2xl animate-[fadeIn_0.2s_ease-out]"
    >{{ toast }}</div>

    <div v-if="error" data-testid="groups-error" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 items-start">
      <!-- Sidebar: group list + creator -->
      <aside class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <form @submit.prevent="onCreateGroup" class="p-3 border-b border-gray-100 flex gap-2" autocomplete="off">
          <input
            v-model="newGroupName"
            type="text"
            maxlength="80"
            placeholder="New group name…"
            data-testid="groups-new-name-input"
            name="thuddle-new-group-name"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
            data-bwignore="true"
            class="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="submit"
            :disabled="creating || !newGroupName.trim()"
            data-testid="groups-create-btn"
            class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition"
            aria-label="Create group"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </form>

        <div v-if="loaded && groups.length === 0" data-testid="groups-empty-sidebar" class="px-4 py-8 text-center text-sm text-gray-400">
          No groups yet. Create your first one above.
        </div>

        <ul v-else class="py-1" data-testid="groups-sidebar-list">
          <li v-for="g in groups" :key="g.id">
            <button
              type="button"
              :data-testid="`groups-sidebar-item`"
              :data-group-id="g.id"
              @click="selectedId = g.id"
              class="flex items-center justify-between w-full px-4 py-2 text-sm text-left transition-colors"
              :class="selectedId === g.id
                ? 'bg-indigo-50 text-indigo-900 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'"
            >
              <span class="truncate">{{ g.name }}</span>
              <span class="shrink-0 text-xs text-gray-400 tabular-nums ml-2">{{ g.memberCount }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Main pane -->
      <section v-if="selected" class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div class="flex items-center justify-between mb-1">
          <EditableTitle
            v-model="selected.name"
            test-id="groups-title"
            aria-label="Group name"
            placeholder="Unnamed group"
            @commit="onRename"
          />
          <button
            type="button"
            data-testid="groups-delete-btn"
            @click="confirmDelete = selected"
            class="text-xs text-gray-400 hover:text-red-600 transition"
          >Delete group</button>
        </div>
        <p class="text-sm text-gray-400 mb-5">
          {{ selected.members.length }} {{ selected.members.length === 1 ? 'member' : 'members' }}
        </p>

        <div class="mb-5">
          <UserSearchComboBox
            placeholder="Add a person by name or email…"
            :exclude-emails="excludedEmails"
            @select="onUserSelected"
          />
        </div>

        <div v-if="selected.members.length === 0" data-testid="groups-members-empty" class="text-sm text-gray-400 text-center py-10 border border-dashed border-gray-200 rounded-xl">
          This group is empty. Search above to add someone.
        </div>

        <ul v-else data-testid="groups-members-list" class="divide-y divide-gray-100">
          <li
            v-for="m in selected.members"
            :key="m.userId"
            data-testid="groups-member-row"
            class="flex items-center gap-3 py-2.5"
          >
            <span class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
              {{ userInitials(m) }}
            </span>
            <span class="flex-1 min-w-0">
              <span class="block truncate font-medium text-gray-900">{{ m.displayName }}</span>
              <span class="block truncate text-xs text-gray-400">{{ m.email }}</span>
            </span>
            <button
              type="button"
              data-testid="groups-member-remove-btn"
              @click="onRemoveMember(m)"
              class="shrink-0 text-xs text-gray-400 hover:text-red-600 transition"
            >Remove</button>
          </li>
        </ul>
      </section>

      <section v-else class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center text-sm text-gray-400">
        Select a group on the left, or create a new one.
      </section>
    </div>

    <ConfirmDialog
      v-if="confirmDelete"
      :open="!!confirmDelete"
      :title="`Delete “${confirmDelete.name}”?`"
      message="This only deletes the group. The people in it remain on Thuddle."
      confirm-label="Delete"
      variant="danger"
      @confirm="onDelete"
      @cancel="confirmDelete = null"
    />
  </div>
</template>
