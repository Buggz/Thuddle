<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { boardGameApi } from '@/api'
import { useApi } from '@/shared/composables/useApi'

const props = defineProps({
  modelValue: { type: String, default: '' },
  selectedBggId: { type: [Number, null], default: null },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'update:selectedBggId', 'bgg-selected'])

const { authFetch } = useApi()

const mode = ref('bgg') // 'bgg' | 'custom'
const searchQuery = ref('')
const results = ref([])
const searching = ref(false)
const selectedGame = ref(null)
const loadingDetail = ref(false)

let debounceTimer = null

function switchMode(m) {
  mode.value = m
  if (m === 'custom') {
    emit('update:selectedBggId', null)
    selectedGame.value = null
    results.value = []
    searchQuery.value = ''
  }
}

function onSearchInput(e) {
  searchQuery.value = e.target.value
  clearTimeout(debounceTimer)
  if (searchQuery.value.length < 2) {
    results.value = []
    return
  }
  searching.value = true
  debounceTimer = setTimeout(async () => {
    try {
      results.value = await boardGameApi.search(searchQuery.value)
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }, 300)
}

async function selectGame(game) {
  loadingDetail.value = true
  results.value = []
  searchQuery.value = ''
  try {
    const detail = await boardGameApi.getDetail(authFetch, game.bggId)
    selectedGame.value = detail
    emit('update:modelValue', detail.name)
    emit('update:selectedBggId', detail.bggId)
    emit('bgg-selected', detail)
  } catch {
    // Fall back to the search result data
    selectedGame.value = game
    emit('update:modelValue', game.name)
    emit('update:selectedBggId', game.bggId)
  } finally {
    loadingDetail.value = false
  }
}

function clearSelection() {
  selectedGame.value = null
  emit('update:modelValue', '')
  emit('update:selectedBggId', null)
  searchQuery.value = ''
}

function onCustomInput(e) {
  emit('update:modelValue', e.target.value)
}

// If parent clears selectedBggId externally, sync local state
watch(() => props.selectedBggId, (val) => {
  if (!val) selectedGame.value = null
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
})

const showResults = computed(() => results.value.length > 0 && !selectedGame.value)

const categoryLabels = {
  abstractsRank: 'Abstract',
  cgsRank: 'Customizable',
  childrensGamesRank: "Children's",
  familyGamesRank: 'Family',
  partyGamesRank: 'Party',
  strategyGamesRank: 'Strategy',
  thematicRank: 'Thematic',
  warGamesRank: 'War',
}

function bestCategory(game) {
  let best = null
  for (const [key, label] of Object.entries(categoryLabels)) {
    const rank = game[key]
    if (rank && rank > 0 && (!best || rank < best.rank)) {
      best = { label, rank }
    }
  }
  return best
}
</script>

<template>
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Item name <span class="text-red-400">*</span></label>

    <!-- Segmented control -->
    <div class="mb-2 inline-flex rounded-lg bg-gray-100 p-0.5">
      <button
        type="button"
        data-testid="item-source-bgg"
        :disabled="disabled"
        @click="switchMode('bgg')"
        class="rounded-md px-3 py-1 text-xs font-bold transition-all"
        :class="mode === 'bgg' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'"
      >
        Search BGG
      </button>
      <button
        type="button"
        data-testid="item-source-custom"
        :disabled="disabled"
        @click="switchMode('custom')"
        class="rounded-md px-3 py-1 text-xs font-bold transition-all"
        :class="mode === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'"
      >
        Custom item
      </button>
    </div>

    <!-- BGG mode -->
    <div v-if="mode === 'bgg'">
      <!-- Selected game card -->
      <div v-if="selectedGame" data-testid="bgg-selected-game" class="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2.5">
        <img
          v-if="selectedGame.thumbnailUrl"
          :src="selectedGame.thumbnailUrl"
          :alt="selectedGame.name"
          class="h-10 w-10 rounded-lg object-cover shrink-0"
        />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-gray-900 truncate">{{ selectedGame.name }}</p>
          <div class="flex items-center gap-2 mt-0.5 flex-wrap">
            <span v-if="selectedGame.yearPublished" class="text-xs text-gray-500">{{ selectedGame.yearPublished }}</span>
            <span v-if="selectedGame.averageRating" class="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              {{ selectedGame.averageRating.toFixed(1) }}
            </span>
            <span v-if="selectedGame.bggRank" class="text-[10px] font-bold text-amber-700">Overall #{{ selectedGame.bggRank }}</span>
            <span v-if="bestCategory(selectedGame)" class="text-[10px] font-bold text-indigo-600">{{ bestCategory(selectedGame).label }} #{{ bestCategory(selectedGame).rank }}</span>
          </div>
        </div>
        <button
          type="button"
          data-testid="bgg-search-clear"
          :disabled="disabled"
          @click="clearSelection"
          class="shrink-0 text-gray-400 hover:text-red-500 transition-colors"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Search input -->
      <div v-else class="relative">
        <input
          data-testid="bgg-search-input"
          type="text"
          :value="searchQuery"
          :disabled="disabled || loadingDetail"
          @input="onSearchInput"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          placeholder="Search for a board game…"
        />
        <svg v-if="searching || loadingDetail" class="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>

        <!-- Results dropdown -->
        <div
          v-if="showResults"
          data-testid="bgg-search-results"
          class="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto"
        >
          <button
            v-for="game in results"
            :key="game.bggId"
            type="button"
            data-testid="bgg-search-result-row"
            @click="selectGame(game)"
            class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-indigo-50 transition-colors border-b border-gray-100 last:border-0"
          >
            <img
              v-if="game.thumbnailUrl"
              :src="game.thumbnailUrl"
              :alt="game.name"
              class="h-10 w-10 rounded-lg object-cover shrink-0"
            />
            <div v-else class="h-10 w-10 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center">
              <svg class="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z" />
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-gray-900 truncate">{{ game.name }}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <span v-if="game.yearPublished" class="text-xs text-gray-500">{{ game.yearPublished }}</span>
                <span v-if="game.averageRating" class="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                  {{ game.averageRating.toFixed(1) }}
                </span>
              </div>
            </div>
            <div class="shrink-0 flex flex-col items-end gap-0.5">
              <span
                v-if="game.bggRank && game.bggRank > 0"
                class="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200/60"
              >
                Overall #{{ game.bggRank }}
              </span>
              <span
                v-if="bestCategory(game)"
                class="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200/60"
              >
                {{ bestCategory(game).label }} #{{ bestCategory(game).rank }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <p class="mt-1.5 text-[10px] text-gray-400">Game data from <a href="https://boardgamegeek.com" target="_blank" rel="noopener" class="underline hover:text-gray-600">BoardGameGeek</a></p>
    </div>

    <!-- Custom mode -->
    <div v-else>
      <input
        data-testid="submit-item-name"
        type="text"
        :value="modelValue"
        :disabled="disabled"
        @input="onCustomInput"
        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
        placeholder="A signed first edition…"
      />
    </div>
  </div>
</template>
