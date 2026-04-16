<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAdminApi } from '@/features/admin/composables/useAdminApi'
import UserSearchComboBox from '@/shared/components/UserSearchComboBox.vue'

const {
  entries,
  knownPermissions,
  loaded,
  loadPermissions,
  grantPermission,
  revokePermission,
} = useAdminApi()

const selectedUser = ref(null)
const grantPerm = ref('')
const granting = ref(false)
const error = ref(null)
const toast = ref(null)
let toastTimer = null

const confirmRevoke = ref(null)

// Group entries by user for a cleaner table
const userMap = computed(() => {
  const map = new Map()
  for (const e of entries.value) {
    if (!map.has(e.userId)) {
      map.set(e.userId, {
        userId: e.userId,
        email: e.email,
        displayName: e.displayName,
        permissions: [],
      })
    }
    map.get(e.userId).permissions.push(e.permission)
  }
  return [...map.values()].sort((a, b) => a.email.localeCompare(b.email))
})

function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3500)
}

onMounted(async () => {
  await loadPermissions()
  if (knownPermissions.value.length && !grantPerm.value) {
    grantPerm.value = knownPermissions.value[0]
  }
})

function onUserSelected(result) {
  if (result.type === 'user') {
    selectedUser.value = { id: result.id, email: result.email, displayName: result.displayName || result.fullName || result.email }
  }
}

function clearSelectedUser() {
  selectedUser.value = null
}

async function onGrant() {
  if (!selectedUser.value || !grantPerm.value) return
  const { email } = selectedUser.value
  const perm = grantPerm.value
  granting.value = true
  error.value = null
  try {
    await grantPermission(email, perm)
    selectedUser.value = null
    showToast(`Granted ${perm} to ${email}`)
  } catch (err) {
    error.value = err.message || 'Failed to grant permission.'
  } finally {
    granting.value = false
  }
}

async function onRevoke() {
  if (!confirmRevoke.value) return
  const { userId, email, permission } = confirmRevoke.value
  confirmRevoke.value = null
  try {
    await revokePermission(userId, permission)
    showToast(`Revoked ${permission} from ${email}`)
  } catch (err) {
    error.value = err.message || 'Failed to revoke permission.'
  }
}

const permBadgeClass = {
  'events:write': 'bg-blue-50 text-blue-700 border-blue-200/60',
  'groups:manage': 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  'admin:access': 'bg-amber-50 text-amber-700 border-amber-200/60',
}
function badgeClass(perm) {
  return permBadgeClass[perm] || 'bg-slate-50 text-slate-700 border-slate-200/60'
}
</script>

<template>
  <div class="max-w-4xl mx-auto pb-12">
    <div class="mb-8">
      <h1 data-testid="admin-heading" class="text-3xl font-extrabold text-slate-900 tracking-tight">Admin</h1>
      <p class="text-slate-500 mt-1">Manage user permissions across the platform.</p>
    </div>

    <div
      v-if="toast"
      data-testid="admin-toast"
      class="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-900 text-white text-sm font-medium px-5 py-3 shadow-2xl animate-[fadeIn_0.3s_ease-out]"
    >{{ toast }}</div>

    <div v-if="error" data-testid="admin-error" class="mb-6 rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-800 font-medium">
      {{ error }}
      <button class="ml-3 underline hover:no-underline" @click="error = null">dismiss</button>
    </div>

    <!-- Grant permission form -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
      <h2 class="text-base font-bold text-slate-900 mb-4">Grant Permission</h2>
      <form @submit.prevent="onGrant" class="flex flex-col sm:flex-row gap-3 items-start" autocomplete="off">
        <div class="flex-1 min-w-0" data-testid="admin-grant-user-picker">
          <div v-if="selectedUser" class="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-2.5 text-sm font-medium">
            <span class="truncate" data-testid="admin-grant-selected-user">{{ selectedUser.displayName }} <span class="text-slate-500 font-normal">({{ selectedUser.email }})</span></span>
            <button
              type="button"
              data-testid="admin-grant-clear-user"
              class="shrink-0 ml-auto text-slate-400 hover:text-red-500 transition-colors"
              @click="clearSelectedUser"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <UserSearchComboBox
            v-else
            placeholder="Search for a user…"
            @select="onUserSelected"
          />
        </div>
        <select
          v-model="grantPerm"
          data-testid="admin-grant-permission-select"
          class="rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-medium bg-white"
        >
          <option v-for="p in knownPermissions" :key="p" :value="p">{{ p }}</option>
        </select>
        <button
          type="submit"
          :disabled="granting || !selectedUser || !grantPerm"
          data-testid="admin-grant-btn"
          class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-sm hover:bg-indigo-700 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Grant
        </button>
      </form>
    </div>

    <!-- Permissions table -->
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100">
        <h2 class="text-base font-bold text-slate-900">Current Permissions</h2>
      </div>

      <div v-if="!loaded" class="px-6 py-16 text-center text-sm text-slate-400 font-medium">Loading…</div>

      <div v-else-if="userMap.length === 0" data-testid="admin-empty" class="px-6 py-16 text-center text-sm text-slate-400 font-medium">
        No permissions have been granted yet.
      </div>

      <table v-else class="w-full text-sm" data-testid="admin-permissions-table">
        <thead class="bg-slate-50/50">
          <tr class="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <th class="px-6 py-3">User</th>
            <th class="px-6 py-3">Permissions</th>
            <th class="px-6 py-3 w-12"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <template v-for="user in userMap" :key="user.userId">
            <tr
              v-for="(perm, idx) in user.permissions"
              :key="perm"
              data-testid="admin-permission-row"
              :data-user-email="user.email"
              :data-permission="perm"
              class="group hover:bg-slate-50/50 transition-colors"
            >
              <td v-if="idx === 0" :rowspan="user.permissions.length" class="px-6 py-3 align-top">
                <div class="font-semibold text-slate-900">{{ user.displayName || user.email }}</div>
                <div v-if="user.displayName" class="text-xs text-slate-500 font-medium">{{ user.email }}</div>
              </td>
              <td class="px-6 py-3">
                <span
                  class="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-lg border"
                  :class="badgeClass(perm)"
                >{{ perm }}</span>
              </td>
              <td class="px-6 py-3 text-right">
                <button
                  type="button"
                  data-testid="admin-revoke-btn"
                  :data-user-id="user.userId"
                  :data-permission="perm"
                  @click="confirmRevoke = { userId: user.userId, email: user.email, permission: perm }"
                  class="text-xs font-semibold text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 transition-all px-3 py-1.5 rounded-md hover:bg-red-50"
                >Revoke</button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Confirm revoke dialog -->
    <Teleport to="body">
      <div v-if="confirmRevoke" class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-full max-w-sm mx-4">
          <h3 class="text-lg font-bold text-slate-900 mb-2">Revoke permission?</h3>
          <p class="text-sm text-slate-600 mb-6">
            Remove <span class="font-bold">{{ confirmRevoke.permission }}</span> from
            <span class="font-bold">{{ confirmRevoke.email }}</span>?
          </p>
          <div class="flex justify-end gap-3">
            <button
              data-testid="admin-revoke-cancel"
              @click="confirmRevoke = null"
              class="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
            >Cancel</button>
            <button
              data-testid="admin-revoke-confirm"
              @click="onRevoke"
              class="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 shadow-sm hover:shadow-md transition-all"
            >Revoke</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
