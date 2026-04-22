<script setup>
import { computed, shallowRef, watch } from 'vue'
import { boardGameApi } from '@/api'
import { useApi } from '@/shared/composables/useApi'

const props = defineProps({
  bggId: { type: Number, default: null },
  averageRating: { type: Number, default: null },
  usersRated: { type: Number, default: null },
  compact: { type: Boolean, default: false }
})

const { authFetch } = useApi()

const detailCache = globalThis.__thuddleBoardGameCredibilityCache
  || (globalThis.__thuddleBoardGameCredibilityCache = new Map())
const pendingCache = globalThis.__thuddleBoardGameCredibilityPending
  || (globalThis.__thuddleBoardGameCredibilityPending = new Map())

const averageRatingValue = shallowRef(null)
const usersRatedValue = shallowRef(0)

let requestToken = 0

function toAverageRating(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function toUsersRated(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function normalizeDetail(detail) {
  return {
    averageRating: toAverageRating(detail?.averageRating),
    usersRated: toUsersRated(detail?.usersRated)
  }
}

async function loadBoardGameDetail(bggId) {
  if (detailCache.has(bggId)) return detailCache.get(bggId)
  if (pendingCache.has(bggId)) return pendingCache.get(bggId)

  const request = boardGameApi.getDetail(authFetch, bggId)
    .then((detail) => {
      const normalized = normalizeDetail(detail)
      detailCache.set(bggId, normalized)
      return normalized
    })
    .finally(() => {
      pendingCache.delete(bggId)
    })

  pendingCache.set(bggId, request)
  return request
}

watch(
  () => [props.bggId, props.averageRating, props.usersRated],
  async ([bggId, averageRating, usersRated]) => {
    requestToken += 1
    const currentRequest = requestToken

    averageRatingValue.value = toAverageRating(averageRating)
    usersRatedValue.value = toUsersRated(usersRated)

    if (!bggId || averageRatingValue.value !== null || usersRatedValue.value > 0) return

    try {
      const detail = await loadBoardGameDetail(bggId)
      if (currentRequest !== requestToken) return
      averageRatingValue.value = detail.averageRating
      usersRatedValue.value = detail.usersRated
    } catch {
      if (currentRequest !== requestToken) return
      averageRatingValue.value = null
      usersRatedValue.value = 0
    }
  },
  { immediate: true }
)

const hasCredibility = computed(() =>
  averageRatingValue.value !== null || usersRatedValue.value > 0
)

const formattedAverageRating = computed(() =>
  averageRatingValue.value === null ? null : averageRatingValue.value.toFixed(1)
)

const formattedUsersRated = computed(() =>
  new Intl.NumberFormat().format(usersRatedValue.value)
)

const wrapperClass = computed(() =>
  props.compact ? 'mt-1 flex flex-wrap items-center gap-1.5' : 'mt-3 flex flex-wrap items-center gap-2'
)

const ratingBadgeClass = computed(() =>
  props.compact
    ? 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/70'
    : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/70'
)

const countBadgeClass = computed(() =>
  props.compact
    ? 'inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200/80'
    : 'inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200/80'
)
</script>

<template>
  <div v-if="hasCredibility" :class="wrapperClass">
    <span v-if="formattedAverageRating" :class="ratingBadgeClass">
      <svg :class="compact ? 'h-3 w-3' : 'h-3.5 w-3.5'" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span>BGG {{ formattedAverageRating }}</span>
    </span>

    <span v-if="usersRatedValue > 0" :class="countBadgeClass">
      <svg :class="compact ? 'h-3 w-3' : 'h-3.5 w-3.5'" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.964 0a9 9 0 10-11.964 0m11.964 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <span>{{ formattedUsersRated }} ratings</span>
    </span>
  </div>
</template>