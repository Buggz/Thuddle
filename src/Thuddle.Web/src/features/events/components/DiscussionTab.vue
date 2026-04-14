<script setup>
import { ref, shallowRef, onMounted } from 'vue'
import { useApi } from '@/shared/composables/useApi'
import { useAuthStore } from '@/features/auth/stores/auth'
import { apiUrl } from '@/api'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'

const props = defineProps({
  eventId: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
})

const { authFetch } = useApi()
const auth = useAuthStore()

const posts = ref([])
const settings = ref(null)
const loading = shallowRef(true)
const error = shallowRef(null)

// New post form
const showNewPost = shallowRef(false)
const newPostContent = ref('')
const sendEmail = shallowRef(false)
const posting = shallowRef(false)

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

async function deletePost(post) {
  if (!confirm('Delete this post? This will also delete all comments.')) return
  try {
    await authFetch(`/api/events/${props.eventId}/discussion/${post.id}`, { method: 'DELETE' })
    posts.value = posts.value.filter(p => p.id !== post.id)
  } catch (err) {
    error.value = err.message || 'Failed to delete post.'
  }
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

async function deleteComment(postId, commentId) {
  try {
    await authFetch(`/api/events/${props.eventId}/discussion/${postId}/comments/${commentId}`, { method: 'DELETE' })
    commentsMap.value[postId] = commentsMap.value[postId].filter(c => c.id !== commentId)
    const post = posts.value.find(p => p.id === postId)
    if (post) post.commentCount--
  } catch (err) {
    error.value = err.message || 'Failed to delete comment.'
  }
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
  // If non-member posts are allowed, or we can't tell membership, allow posting
  // (the server will enforce membership rules)
  return true
}

onMounted(loadPosts)
</script>

<template>
  <div>
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">
      {{ error }}
    </div>

    <div v-if="loading" class="text-center py-8 text-gray-400 text-sm">Loading discussion...</div>

    <template v-else>
      <!-- New post button / form -->
      <div v-if="canPost()" class="mb-6">
        <button
          v-if="!showNewPost"
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
              <button @click="showNewPost = false; newPostContent = ''"
                class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
              <button @click="createPost" :disabled="posting || !newPostContent.trim()"
                class="px-4 py-1.5 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {{ posting ? 'Posting…' : 'Post' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Posts list -->
      <div v-if="posts.length === 0" class="text-center py-8">
        <p class="text-gray-400 text-sm">No posts yet.{{ canPost() ? ' Be the first to start the discussion!' : '' }}</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="post in posts"
          :key="post.id"
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
              <span v-if="!post.isApproved"
                class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                Pending
              </span>
              <button v-if="isAdmin && !post.isOwnPost" @click="toggleApproval(post)"
                class="text-xs font-medium px-2 py-1 rounded transition-colors"
                :class="post.isApproved
                  ? 'text-amber-600 hover:bg-amber-50'
                  : 'text-green-600 hover:bg-green-50'">
                {{ post.isApproved ? 'Unapprove' : 'Approve' }}
              </button>
              <button v-if="isAdmin || post.isOwnPost" @click="deletePost(post)"
                class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">
                Delete
              </button>
            </div>
          </div>

          <!-- Post content -->
          <div class="px-4 pb-3 prose prose-sm max-w-none text-gray-700" v-html="post.content" />

          <!-- Comments toggle -->
          <div class="border-t border-gray-100 px-4 py-2">
            <button
              @click="toggleComments(post)"
              class="text-sm text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.671 1.09-.085 2.17-.207 3.238-.364 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              {{ post.commentCount }} {{ post.commentCount === 1 ? 'comment' : 'comments' }}
              <svg class="w-3 h-3 transition-transform" :class="{ 'rotate-180': expandedComments.has(post.id) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
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
                      <button v-if="isAdmin" @click="deleteComment(post.id, comment.id)"
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
                    v-model="newCommentText[post.id]"
                    @keyup.enter="addComment(post.id)"
                    type="text"
                    placeholder="Write a comment..."
                    class="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
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
