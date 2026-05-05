<script setup>
import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import { useApi } from '@/shared/composables/useApi'
import { useInlineImageUpload } from '@/shared/composables/useInlineImageUpload'
import { useAuthStore } from '@/features/auth/stores/auth'
import { useRealtime, RealtimeEvents } from '@/shared/composables/useRealtime'
import { apiUrl } from '@/api'
import RichTextEditor from '@/shared/components/RichTextEditor.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

const props = defineProps({
  eventId: { type: String, required: true },
  isAdmin: { type: Boolean, default: false }
})

const { authFetch } = useApi()
const { uploadImage } = useInlineImageUpload(() => props.eventId)
const auth = useAuthStore()
const realtime = useRealtime()

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

async function ensureCommentsExpanded(post) {
  if (!expandedComments.value.has(post.id)) {
    await toggleComments(post)
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
    // Post.commentCount is NOT bumped optimistically — the server broadcasts
    // an authoritative CommentCountChanged frame that we apply absolutely.
    // Applying a +1 here would race with that frame and double-count.
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
        // Post.commentCount is NOT decremented optimistically — server
        // broadcasts an authoritative CommentCountChanged we apply absolutely.
      } catch (err) {
        error.value = err.message || 'Failed to delete comment.'
      }
    }
  )
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

function handleDiscussionActivity({ eventId }) {
  if (eventId !== props.eventId) return
  loadPosts()
  // Refresh any comments the user currently has open
  expandedComments.value.forEach((postId) => loadComments(postId))
}

/**
 * Apply an authoritative comment-count update for a single post. The payload
 * is absolute ({ commentCount, latestCommentAt }) so we replace fields rather
 * than adding deltas — that avoids any race with in-flight optimistic
 * mutations on the client.
 */
function handleCommentCountChanged({ eventId, postId, commentCount, latestCommentAt }) {
  if (eventId !== props.eventId) return
  const post = posts.value.find(p => p.id === postId)
  if (!post) return
  post.commentCount = commentCount
  post.latestCommentAt = latestCommentAt
}

onMounted(() => {
  loadPosts()
  realtime.ensureStarted().catch(() => { /* best-effort */ })
  realtime.on(RealtimeEvents.DiscussionActivity, handleDiscussionActivity)
  realtime.on(RealtimeEvents.CommentCountChanged, handleCommentCountChanged)
})

onBeforeUnmount(() => {
  realtime.off(RealtimeEvents.DiscussionActivity, handleDiscussionActivity)
  realtime.off(RealtimeEvents.CommentCountChanged, handleCommentCountChanged)
})
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

    <div v-if="loading" class="text-[11px] font-bold tracking-wider uppercase text-slate-400 flex items-center justify-center py-12">Loading discussion...</div>

    <template v-else>
      <!-- New post button / form -->
      <div v-if="canPost()" class="mb-6">
        <button
          v-if="!showNewPost"
          data-testid="discussion-new-post-btn"
          @click="showNewPost = true"
          class="w-full rounded-2xl border-2 border-dashed border-slate-300 py-4 text-[13px] font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Write a post
        </button>

        <div v-else class="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 shadow-sm">
          <RichTextEditor v-model="newPostContent" :upload-image="uploadImage" class="bg-white" />
          <div class="flex items-center justify-between mt-4">
            <label v-if="isAdmin" class="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
              <input type="checkbox" v-model="sendEmail"
                class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer" />
              Email attendees
            </label>
            <span v-else />
            <div class="flex items-center gap-3">
              <button data-testid="discussion-cancel-post-btn" @click="showNewPost = false; newPostContent = ''"
                class="px-4 py-2 text-[13px] font-bold text-slate-500 hover:text-slate-800 transition-colors">
                Cancel
              </button>
              <button data-testid="discussion-submit-post-btn" @click="createPost" :disabled="posting || !newPostContent.trim()"
                class="px-6 py-2 text-[13px] font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm">
                {{ posting ? 'Posting…' : 'Post' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="postDeniedReason()" data-testid="discussion-denied-msg" class="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-[13px] font-medium text-slate-500">
        {{ postDeniedReason() }}
      </div>

      <!-- Posts list -->
      <div v-if="posts.length === 0" data-testid="discussion-empty" class="text-center py-16 px-6 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 my-2">
        <div class="mx-auto w-16 h-16 rounded-full bg-slate-100 border border-slate-200/60 shadow-sm flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
        </div>
        <h3 class="text-sm font-bold text-slate-900 mb-1">No posts yet</h3>
        <p class="text-xs text-slate-500 max-w-[200px] mx-auto leading-relaxed">{{ canPost() ? 'Be the first to start the discussion!' : 'When someone posts, it will appear here.' }}</p>
      </div>

      <div v-else class="space-y-5">
        <div
          v-for="post in posts"
          :key="post.id"
          data-testid="discussion-post"
          class="rounded-2xl border bg-white shadow-sm overflow-hidden"
          :class="post.isApproved ? 'border-slate-200/80' : 'border-amber-200/80 bg-amber-50/20'"
        >
          <!-- Post header -->
          <div class="flex items-center gap-3.5 px-5 pt-5 pb-2">
            <img
              v-if="post.profilePictureUrl"
              :src="apiUrl(post.profilePictureUrl)"
              :alt="post.authorName"
              class="w-10 h-10 rounded-full object-cover border border-slate-200/50 shadow-sm"
            />
            <span
              v-else
              class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/50 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] text-slate-500 flex items-center justify-center text-[13px] font-bold"
            >
              {{ post.authorName?.charAt(0).toUpperCase() }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-[14px] font-bold text-slate-900 truncate tracking-tight">{{ post.authorName }}</p>
              <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">{{ formatRelative(post.createdAt) }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="!post.isApproved" data-testid="discussion-pending-badge"
                class="inline-flex items-center rounded-lg bg-amber-50 border border-amber-200/50 px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-amber-600 shadow-sm">
                Pending
              </span>
              <button v-if="isAdmin && !post.isOwnPost && settings?.memberPostPolicy === 0" data-testid="discussion-approve-btn" @click="toggleApproval(post)"
                class="text-[11px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-lg transition-colors"
                :class="post.isApproved
                  ? 'text-amber-600 hover:bg-amber-50 border border-amber-200/50'
                  : 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200/50'">
                {{ post.isApproved ? 'Unapprove' : 'Approve' }}
              </button>
              <button v-if="isAdmin || post.isOwnPost" data-testid="discussion-delete-post-btn" @click="deletePost(post)"
                class="text-slate-400 hover:text-rose-500 font-medium p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                title="Delete Post">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            </div>
          </div>

          <!-- Post content -->
          <div data-testid="discussion-post-content" class="px-5 pb-4 prose prose-sm max-w-none text-slate-700 leading-relaxed" v-html="post.content" />

          <!-- Comments toggle -->
          <div class="border-t border-slate-100 px-5 py-3">
            <button
              data-testid="discussion-toggle-comments-btn"
              @click="toggleComments(post)"
              class="group flex items-center transition-colors"
            >
              <div class="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors"
                   :class="hasNewComments(post) ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-[inset_0_1px_1px_rgba(255,255,255,1)]' : 'bg-slate-50 text-slate-600 border border-slate-200/60 group-hover:bg-slate-100/80 group-hover:text-slate-900 shadow-sm'">
                <div class="relative">
                  <svg class="w-4 h-4" :class="hasNewComments(post) ? 'text-indigo-600' : 'opacity-60'" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
                  </svg>
                  <!-- Notification dot specifically on the icon -->
                  <span v-if="hasNewComments(post)" data-testid="discussion-new-comments-indicator" class="absolute -top-1 -right-1.5 flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-rose-500 ring-1 ring-indigo-50"></span>
                  </span>
                </div>
                <span class="text-[12px] font-medium" :class="{'font-bold text-indigo-700': hasNewComments(post)}">{{ post.commentCount }} {{ post.commentCount === 1 ? 'comment' : 'comments' }}</span>
                <svg class="w-3.5 h-3.5 ml-0.5 transition-transform opacity-50" :class="{ 'rotate-180': expandedComments.has(post.id) }" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </button>

            <!-- Comments section -->
            <div v-if="expandedComments.has(post.id)" class="mt-4 space-y-4">
              <div v-if="commentsLoading.has(post.id)" class="text-[11px] font-bold tracking-wider uppercase text-slate-400 py-4 flex justify-center">Loading comments...</div>

              <template v-else>
                <div
                  v-for="comment in (commentsMap[post.id] || [])"
                  :key="comment.id"
                  class="flex flex-col gap-1 pl-2 sm:flex-row sm:gap-3 sm:pl-4 relative group/comment"
                >
                  <div class="hidden sm:flex shrink-0">
                    <img
                      v-if="comment.profilePictureUrl"
                      :src="apiUrl(comment.profilePictureUrl)"
                      :alt="comment.authorName"
                      class="w-8 h-8 rounded-full object-cover border border-slate-200/50 shadow-sm mt-0.5"
                    />
                    <span
                      v-else
                      class="w-8 h-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/50 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] text-slate-500 flex items-center justify-center text-[11px] font-bold mt-0.5"
                    >
                      {{ comment.authorName?.charAt(0).toUpperCase() }}
                    </span>
                  </div>
                  
                  <div class="flex-1 min-w-0 flex flex-col items-start w-full">
                    <div class="flex items-center gap-2 mb-1 pl-9 sm:pl-1">
                      <span class="text-[12px] font-bold text-slate-900">{{ comment.authorName }}</span>
                      <span class="text-[10px] font-medium uppercase tracking-widest text-slate-400">{{ formatRelative(comment.createdAt) }}</span>
                    </div>
                    
                    <div class="relative w-full max-w-[90%] sm:max-w-[85%] flex items-center gap-2">
                       <!-- Mobile Avatar positioned over the bubble edge -->
                      <div class="absolute -left-2 top-0.5 sm:hidden shrink-0">
                        <img
                          v-if="comment.profilePictureUrl"
                          :src="apiUrl(comment.profilePictureUrl)"
                          :alt="comment.authorName"
                          class="w-7 h-7 rounded-full object-cover border border-slate-200/50 shadow-sm"
                        />
                        <span
                          v-else
                          class="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/50 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] text-slate-500 flex items-center justify-center text-[10px] font-bold"
                        >
                          {{ comment.authorName?.charAt(0).toUpperCase() }}
                        </span>
                      </div>
                      
                      <div class="bg-slate-100/60 border border-slate-200/60 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm ml-7 sm:ml-0 text-[13px] text-slate-700 leading-relaxed max-w-full break-words">
                        {{ comment.content }}
                      </div>
                      
                      <button v-if="isAdmin" @click="deleteComment(post.id, comment)"
                        data-testid="discussion-delete-comment-btn"
                        class="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover/comment:opacity-100 p-1"
                        title="Delete Comment">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

              </template>
            </div>

            <!-- Add comment — always visible when authenticated -->
            <div v-if="auth.isAuthenticated" class="flex gap-3 pt-3 mt-4 border-t border-slate-100/80">
                  <div class="shrink-0 pt-0.5 hidden sm:block">
                     <span class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200/50 shadow-[inset_0_1px_1px_rgba(255,255,255,1)] text-slate-400 flex items-center justify-center">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                     </span>
                  </div>
                  <div class="flex-1 relative">
                    <input
                      data-testid="discussion-comment-input"
                      v-model="newCommentText[post.id]"
                      @keyup.enter="addComment(post.id)"
                      @focus="ensureCommentsExpanded(post)"
                      type="text"
                      placeholder="Write a comment..."
                      class="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 pr-20 text-[13px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition-colors placeholder:text-slate-400 shadow-sm"
                    />
                    <button
                      data-testid="discussion-comment-reply-btn"
                      @click="addComment(post.id)"
                      :disabled="commentPosting.has(post.id) || !(newCommentText[post.id] || '').trim()"
                      class="absolute right-1.5 top-1.5 px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {{ commentPosting.has(post.id) ? '…' : 'Reply' }}
                    </button>
                  </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
