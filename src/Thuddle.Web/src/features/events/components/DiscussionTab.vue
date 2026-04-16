<script setup>
import { ref, shallowRef, onMounted } from 'vue'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

const props = defineProps({
  eventId: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
})

const { authFetch } = useApi()
const auth = useAuthStore()

const posts = ref([])
const settings = ref(null)
const isMember = shallowRef(false)
const lastReadAt = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)

// New post form
const showNewPost = shallowRef(false)
const newPostContent = ref('')
const sendEmail = shallowRef(false)
const posting = shallowRef(false)

// Delete confirmation
const deleteDialog = ref({ open: false, title: '', message: '', onConfirm: null })

function showDeleteConfirm(title, message, onConfirm) {
  deleteDialog.value = { open: true, title, message, onConfirm }
}

function closeDeleteDialog() {
  deleteDialog.value = { open: false, title: '', message: '', onConfirm: null }
}

function confirmDelete() {
  deleteDialog.value.onConfirm?.()
  closeDeleteDialog()
}

// Comments state per post
const expandedComments = ref(new Set())
const commentsMap = ref({})
const commentsLoading = ref(new Set())
const newCommentText = ref({})
const commentPosting = ref(new Set())

async function loadPosts() {
  loading.value = true
  error.value = null
  try {
    let res
    if (auth.isAuthenticated) {
      res = await authFetch(`/api/events/${props.eventId}/discussion`)
    } else {
      res = await fetch(apiUrl(`/api/events/${props.eventId}/discussion`))
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
    }
    const data = await res.json()
    posts.value = data.posts
    settings.value = data.settings
    isMember.value = data.isMember ?? false
    lastReadAt.value = data.lastReadAt
  } catch (err) {
    error.value = err.message || 'Failed to load discussion.'
  } finally {
    loading.value = false
  }
}

async function createPost() {
  if (!newPostContent.value.trim()) return
  posting.value = true
  error.value = null
  try {
    const res = await authFetch(`/api/events/${props.eventId}/discussion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: newPostContent.value,
        sendEmail: sendEmail.value
      })
    })
    const post = await res.json()
    posts.value.unshift(post)
    newPostContent.value = ''
    sendEmail.value = false
    showNewPost.value = false
  } catch (err) {
    error.value = err.message || 'Failed to create post.'
  } finally {
    posting.value = false
  }
}

async function toggleApproval(post) {
  try {
    const res = await authFetch(`/api/events/${props.eventId}/discussion/${post.id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved: !post.isApproved })
    })
    const data = await res.json()
    post.isApproved = data.isApproved
  } catch (err) {
    error.value = err.message || 'Failed to update approval.'
  }
}

function deletePost(post) {
  const preview = stripHtml(post.content).slice(0, 80)
  showDeleteConfirm(
    'Delete post',
    `This will permanently delete the post by ${post.authorName}${preview ? ' (\u201C' + preview + (post.content.length > 80 ? '\u2026' : '') + '\u201D)' : ''} and all its comments.`,
    async () => {
      try {
        await authFetch(`/api/events/${props.eventId}/discussion/${post.id}`, { method: 'DELETE' })
        posts.value = posts.value.filter(p => p.id !== post.id)
      } catch (err) {
        error.value = err.message || 'Failed to delete post.'
      }
    }
  )
}

function stripHtml(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || ''
}

async function toggleComments(post) {
  const id = post.id
  if (expandedComments.value.has(id)) {
    expandedComments.value.delete(id)
    expandedComments.value = new Set(expandedComments.value)
    return
  }
  expandedComments.value.add(id)
  expandedComments.value = new Set(expandedComments.value)
  if (!commentsMap.value[id]) {
    await loadComments(id)
  }
}

async function loadComments(postId) {
  commentsLoading.value.add(postId)
  commentsLoading.value = new Set(commentsLoading.value)
  try {
    let res
    if (auth.isAuthenticated) {
      res = await authFetch(`/api/events/${props.eventId}/discussion/${postId}/comments`)
    } else {
      res = await fetch(apiUrl(`/api/events/${props.eventId}/discussion/${postId}/comments`))
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
    }
    commentsMap.value[postId] = await res.json()
  } catch (err) {
    error.value = err.message || 'Failed to load comments.'
  } finally {
    commentsLoading.value.delete(postId)
    commentsLoading.value = new Set(commentsLoading.value)
  }
}

async function addComment(postId) {
  const text = (newCommentText.value[postId] || '').trim()
  if (!text) return
  commentPosting.value.add(postId)
  commentPosting.value = new Set(commentPosting.value)
  try {
    const res = await authFetch(`/api/events/${props.eventId}/discussion/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    })
    const comment = await res.json()
    if (!commentsMap.value[postId]) commentsMap.value[postId] = []
    commentsMap.value[postId].push(comment)
    newCommentText.value[postId] = ''
    // Update comment count on the post
    const post = posts.value.find(p => p.id === postId)
    if (post) post.commentCount++
  } catch (err) {
    error.value = err.message || 'Failed to add comment.'
  } finally {
    commentPosting.value.delete(postId)
    commentPosting.value = new Set(commentPosting.value)
  }
}

function deleteComment(postId, comment) {
  const preview = comment.content.slice(0, 80)
  showDeleteConfirm(
    'Delete comment',
    `This will permanently delete the comment by ${comment.authorName}${preview ? ' (\u201C' + preview + (comment.content.length > 80 ? '\u2026' : '') + '\u201D)' : ''}.`,
    async () => {
      try {
        await authFetch(`/api/events/${props.eventId}/discussion/${postId}/comments/${comment.id}`, { method: 'DELETE' })
        commentsMap.value[postId] = commentsMap.value[postId].filter(c => c.id !== comment.id)
        const post = posts.value.find(p => p.id === postId)
        if (post) post.commentCount--
      } catch (err) {
        error.value = err.message || 'Failed to delete comment.'
      }
    }
  )
}

function profilePictureUrl(keycloakId) {
  return apiUrl(`/api/profile/picture/${keycloakId}`)
}

function formatRelative(iso) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString()
}

// Can the current user post?
async function uploadImage(file) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await authFetch(`/api/events/${props.eventId}/images`, {
    method: 'POST',
    body: formData
  })
  const data = await res.json()
  return data.url
}

function canPost() {
  if (!auth.isAuthenticated) return false
  if (props.isAdmin) return true
  if (!settings.value) return false
  if (isMember.value) return true
  return settings.value.allowNonMemberPosts
}

function postDeniedReason() {
  if (!auth.isAuthenticated) return 'Sign in to write a post.'
  if (!isMember.value && !settings.value?.allowNonMemberPosts) return 'Only attendees can post in this discussion. Join the event to participate.'
  return null
}

function hasNewComments(post) {
  if (!lastReadAt.value || !post.latestCommentAt) return false
  return new Date(post.latestCommentAt) > new Date(lastReadAt.value)
}

onMounted(loadPosts)
</script>

<template>
  <div>
    <ConfirmDialog
      :open="deleteDialog.open"
      :title="deleteDialog.title"
      :message="deleteDialog.message"
      confirm-label="Delete"
      variant="danger"
      @confirm="confirmDelete"
      @cancel="closeDeleteDialog"
    />

    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
      {{ error }}
    </div>

    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">Loading discussion...</div>

    <template v-else>
      <!-- New post button / form -->
      <div v-if="canPost()" class="mb-6">
        <button
          v-if="!showNewPost"
          data-testid="discussion-new-post-btn"
          @click="showNewPost = true"
          class="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
        >
          + Write a post
        </button>

        <div v-else class="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <RichTextEditor v-model="newPostContent" :upload-image="uploadImage" />
          <div class="flex items-center justify-between mt-3">
            <label v-if="isAdmin" class="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" v-model="sendEmail"
                class="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              Email attendees
            </label>
            <span v-else />
            <div class="flex items-center gap-2">
              <button data-testid="discussion-cancel-post-btn" @click="showNewPost = false; newPostContent = ''"
                class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button data-testid="discussion-submit-post-btn" @click="createPost" :disabled="posting || !newPostContent.trim()"
                class="px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {{ posting ? 'Posting…' : 'Post' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="postDeniedReason()" data-testid="discussion-denied-msg" class="mb-6 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        {{ postDeniedReason() }}
      </div>

      <!-- Posts list -->
      <div v-if="posts.length === 0" data-testid="discussion-empty" class="text-center py-8">
        <p class="text-gray-400 text-sm">No posts yet.{{ canPost() ? ' Be the first to start the discussion!' : '' }}</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="post in posts"
          :key="post.id"
          data-testid="discussion-post"
          class="rounded-lg border bg-white"
          :class="post.isApproved ? 'border-gray-200' : 'border-amber-300 bg-amber-50'"
        >
          <!-- Post header -->
          <div class="flex items-center gap-3 px-4 pt-4 pb-2">
            <img
              v-if="post.hasProfilePicture"
              :src="profilePictureUrl(post.authorKeycloakId)"
              :alt="post.authorName"
              class="w-8 h-8 rounded-full object-cover bg-gray-100"
            />
            <span
              v-else
              class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-semibold"
            >
              {{ post.authorName?.charAt(0).toUpperCase() }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ post.authorName }}</p>
              <p class="text-xs text-gray-400">{{ formatRelative(post.createdAt) }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="!post.isApproved" data-testid="discussion-pending-badge"
                class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Pending
              </span>
              <button v-if="isAdmin && !post.isOwnPost" data-testid="discussion-approve-btn" @click="toggleApproval(post)"
                class="text-xs font-medium px-2 py-1 rounded transition-colors"
                :class="post.isApproved
                  ? 'text-amber-600 hover:bg-amber-50'
                  : 'text-green-600 hover:bg-green-50'">
                {{ post.isApproved ? 'Unapprove' : 'Approve' }}
              </button>
              <button v-if="isAdmin || post.isOwnPost" data-testid="discussion-delete-post-btn" @click="deletePost(post)"
                class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
                Delete
              </button>
            </div>
          </div>

          <!-- Post content -->
          <div data-testid="discussion-post-content" class="px-4 pb-3 prose prose-sm max-w-none text-gray-700" v-html="post.content" />

          <!-- Comments toggle -->
          <div class="border-t border-gray-100 px-4 py-3">
            <button
              data-testid="discussion-toggle-comments-btn"
              @click="toggleComments(post)"
              class="group flex items-center transition-colors"
            >
              <div class="relative flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors"
                   :class="hasNewComments(post) ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-200/60 group-hover:bg-gray-100'">
                <div class="relative">
                  <svg class="w-4 h-4" :class="hasNewComments(post) ? 'text-indigo-600' : 'opacity-70'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                  </svg>
                  <!-- Notification dot specifically on the icon -->
                  <span v-if="hasNewComments(post)" data-testid="discussion-new-comments-indicator" class="absolute -top-1 -right-1.5 flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-2 ring-indigo-50"></span>
                  </span>
                </div>
                <span class="text-xs" :class="{'font-bold': hasNewComments(post)}">{{ post.commentCount }} {{ post.commentCount === 1 ? 'comment' : 'comments' }}</span>
                <svg class="w-3.5 h-3.5 ml-0.5 transition-transform opacity-70" :class="{ 'rotate-180': expandedComments.has(post.id) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>

            <!-- Comments section -->
            <div v-if="expandedComments.has(post.id)" class="mt-3 space-y-3">
              <div v-if="commentsLoading.has(post.id)" class="text-xs text-gray-400 py-2">Loading comments...</div>

              <template v-else>
                <div
                  v-for="comment in (commentsMap[post.id] || [])"
                  :key="comment.id"
                  class="flex gap-2.5 pl-2"
                >
                  <img
                    v-if="comment.hasProfilePicture"
                    :src="profilePictureUrl(comment.authorKeycloakId)"
                    :alt="comment.authorName"
                    class="w-6 h-6 rounded-full object-cover bg-gray-100 mt-0.5 shrink-0"
                  />
                  <span
                    v-else
                    class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-semibold mt-0.5 shrink-0"
                  >
                    {{ comment.authorName?.charAt(0).toUpperCase() }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2">
                      <span class="text-xs font-medium text-gray-900">{{ comment.authorName }}</span>
                      <span class="text-[10px] text-gray-400">{{ formatRelative(comment.createdAt) }}</span>
                      <button v-if="isAdmin" @click="deleteComment(post.id, comment)"
                        data-testid="discussion-delete-comment-btn"
                        class="text-[10px] text-red-400 hover:text-red-600 ml-auto">
                        Delete
                      </button>
                    </div>
                    <p class="text-sm text-gray-700 mt-0.5">{{ comment.content }}</p>
                  </div>
                </div>

                <!-- Add comment -->
                <div v-if="auth.isAuthenticated" class="flex gap-2 pt-1">
                  <input
                    data-testid="discussion-comment-input"
                    v-model="newCommentText[post.id]"
                    @keyup.enter="addComment(post.id)"
                    type="text"
                    placeholder="Write a comment..."
                    class="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    data-testid="discussion-comment-reply-btn"
                    @click="addComment(post.id)"
                    :disabled="commentPosting.has(post.id) || !(newCommentText[post.id] || '').trim()"
                    class="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {{ commentPosting.has(post.id) ? '…' : 'Reply' }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
