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
  <div class="max-w-5xl mx-auto pb-12">
    <div class="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 data-testid="groups-heading" class="text-3xl font-extrabold text-slate-900 tracking-tight">Contact Groups</h1>
        <p class="text-slate-500 mt-1">Organize the people you invite often into quick-access circles.</p>
      </div>
    </div>

    <div
      v-if="toast"
      data-testid="groups-toast"
      class="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-900 text-white text-sm font-medium px-5 py-3 shadow-2xl animate-[fadeIn_0.3s_ease-out]"
    >{{ toast }}</div>

    <div v-if="error" data-testid="groups-error" class="mb-6 rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-800 font-medium">
      {{ error }}
    </div>

    <div class="flex flex-col md:flex-row bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] items-stretch">
      <!-- Sidebar: group list + creator -->
      <aside class="w-full md:w-80 bg-slate-50/50 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shrink-0">
        <form @submit.prevent="onCreateGroup" class="p-4 border-b border-slate-200 flex gap-2 bg-white" autocomplete="off">
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
            class="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium"
          />
          <button
            type="submit"
            :disabled="creating || !newGroupName.trim()"
            data-testid="groups-create-btn"
            class="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-md transition-all"
            aria-label="Create group"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </form>

        <div v-if="loaded && groups.length === 0" data-testid="groups-empty-sidebar" class="px-6 py-12 text-center text-sm text-slate-400 font-medium">
          No groups yet.<br>Create your first one above.
        </div>

        <ul v-else class="py-2 px-2 flex-1 overflow-y-auto" data-testid="groups-sidebar-list">
          <li v-for="g in groups" :key="g.id" class="mb-1">
            <button
              type="button"
              :data-testid="`groups-sidebar-item`"
              :data-group-id="g.id"
              @click="selectedId = g.id"
              class="flex items-center justify-between w-full px-4 py-2.5 rounded-xl text-sm text-left transition-all"
              :class="selectedId === g.id
                ? 'bg-white shadow-sm ring-1 ring-slate-200/50 text-indigo-700 font-bold relative z-10'
                : 'text-slate-600 hover:bg-slate-200/50 font-medium'"
            >
              <span class="truncate">{{ g.name }}</span>
              <span 
                class="shrink-0 text-[11px] tabular-nums ml-2 px-2 py-0.5 rounded-full"
                :class="selectedId === g.id ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-500'"
              >{{ g.memberCount }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- Main pane -->
      <section v-if="selected" class="flex-1 flex flex-col bg-white">
        <div class="p-8 pb-6 border-b border-slate-100 flex items-start justify-between">
          <div>
            <div class="mb-1 text-2xl">
              <EditableTitle
                v-model="selected.name"
                test-id="groups-title"
                aria-label="Group name"
                placeholder="Unnamed group"
                @commit="onRename"
              />
            </div>
            <p class="text-sm font-medium text-slate-400">
              {{ selected.members.length }} {{ selected.members.length === 1 ? 'member' : 'members' }}
            </p>
          </div>
          <button
            type="button"
            data-testid="groups-delete-btn"
            @click="confirmDelete = selected"
            class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete group"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>

        <div class="px-8 py-6">
          <div class="mb-8">
            <UserSearchComboBox
              placeholder="Add a person to this group…"
              :exclude-emails="excludedEmails"
              @select="onUserSelected"
            />
          </div>

          <div v-if="selected.members.length === 0" data-testid="groups-members-empty" class="text-sm text-slate-400 font-medium text-center py-16 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
            This group is empty. Use the search above to add someone.
          </div>

          <ul v-else data-testid="groups-members-list" class="divide-y divide-slate-100/60">
            <li
              v-for="m in selected.members"
              :key="m.userId"
              data-testid="groups-member-row"
              class="flex items-center gap-4 py-3 group"
            >
              <span class="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 shadow-sm text-xs font-bold text-slate-600">
                {{ userInitials(m) }}
              </span>
              <span class="flex-1 min-w-0">
                <span class="block truncate font-semibold text-slate-900">{{ m.displayName }}</span>
                <span class="block truncate text-[13px] text-slate-500 font-medium">{{ m.email }}</span>
              </span>
              <button
                type="button"
                data-testid="groups-member-remove-btn"
                @click="onRemoveMember(m)"
                class="shrink-0 text-xs font-semibold text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 transition-all px-3 py-1.5 rounded-md hover:bg-red-50"
              >Remove</button>
            </li>
          </ul>
        </div>
      </section>

      <section v-else class="flex-1 flex flex-col items-center justify-center text-center p-12 bg-slate-50/30">
        <div class="w-16 h-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
        </div>
        <h2 class="text-lg font-bold text-slate-900 mb-1">Select a group</h2>
        <p class="text-sm font-medium text-slate-500">Pick a group from the sidebar, or create a new one.</p>
      </section>
    </div>

    <ConfirmDialog
      v-if="confirmDelete"
      :open="!!confirmDelete"
      :title="`Delete “${confirmDelete.name}”?`"
      message="This only deletes the group. The people in it remain on Thuddle."
      confirm-label="Delete group"
      variant="danger"
      @confirm="onDelete"
      @cancel="confirmDelete = null"
    />
  </div>
</template>
