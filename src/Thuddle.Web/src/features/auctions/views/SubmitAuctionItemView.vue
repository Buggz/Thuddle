<script setup>
import { ref, computed, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { useEventsStore } from '@/features/events/stores/events'
import { parseDecimalInput, formatCurrency } from '@/shared/formatCurrency'
import ImageCropper from '@/features/profile/components/ImageCropper.vue'
import BggSearchInput from '@/features/auctions/components/BggSearchInput.vue'
import { buildAutoDescription, sortGamesByBggRank } from '@/features/auctions/composables/useAuctionDescription'

const route = useRoute()
const router = useRouter()
const auctionStore = useAuctionStore()
const eventsStore = useEventsStore()

const slug = computed(() => String(route.params.slug))
const eventId = computed(() => eventsStore.slugToId[slug.value] ?? null)
const isEditing = computed(() => !!route.params.itemId)
const itemId = computed(() => route.params.itemId)

const { settingsByEvent } = storeToRefs(auctionStore)
const settings = computed(() => settingsByEvent.value[eventId.value] || null)

const form = ref({
  name: '',
  description: '',
  startingBid: '',
  buyoutPrice: ''
})
const submitted = shallowRef(false)
const submitting = shallowRef(false)
const error = shallowRef('')

const selectedGames = ref([])
const sortedSelectedGames = computed(() => sortGamesByBggRank(selectedGames.value))

const descriptionAuto = ref(true)
const lastAutoText = ref('')
const showTakeoverNotice = ref(false)

watch(selectedGames, (newGames) => {
  if (descriptionAuto.value) {
    const text = buildAutoDescription(newGames)
    form.value.description = text
    lastAutoText.value = text
  }
}, { deep: true })

let takeoverTimer = null
function onDescriptionInput(val) {
  if (descriptionAuto.value && val !== lastAutoText.value) {
    descriptionAuto.value = false
    showTakeoverNotice.value = true
    clearTimeout(takeoverTimer)
    takeoverTimer = setTimeout(() => {
      showTakeoverNotice.value = false
    }, 3000)
  }
}

function regenerateDescription() {
  if (confirm('Are you sure you want to overwrite your manual edits with the auto-generated description?')) {
    descriptionAuto.value = true
    const text = buildAutoDescription(selectedGames.value)
    form.value.description = text
    lastAutoText.value = text
  }
}

// Image management — selected before save, uploaded one by one after.
const selectedImages = ref([])  // { file, previewUrl }

// Queue of files awaiting cropping. The first item in the queue is shown in the cropper.
const pendingFiles = ref([])
const currentPendingFile = computed(() => pendingFiles.value[0] ?? null)

function onFiles(event) {
  const files = Array.from(event.target.files || [])
  for (const file of files) {
    pendingFiles.value.push(file)
  }
  event.target.value = ''
}

function onCropDone(blob) {
  const original = pendingFiles.value[0]
  if (!original) return
  const baseName = original.name.replace(/\.[^.]+$/, '')
  const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  selectedImages.value.push({
    file,
    previewUrl: URL.createObjectURL(blob)
  })
  pendingFiles.value.shift()
}

function onCropCancel() {
  pendingFiles.value.shift()
}

function removeImage(idx) {
  const removed = selectedImages.value.splice(idx, 1)[0]
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
}

function editImage(idx) {
  const removed = selectedImages.value.splice(idx, 1)[0]
  if (!removed) return
  if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl)
  pendingFiles.value.unshift(removed.file)
}

onBeforeUnmount(() => {
  for (const img of selectedImages.value) {
    if (img.previewUrl) URL.revokeObjectURL(img.previewUrl)
  }
})

function moveImage(idx, dir) {
  const target = idx + dir
  if (target < 0 || target >= selectedImages.value.length) return
  const arr = selectedImages.value
  ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
}

const startingBid = computed(() => parseDecimalInput(form.value.startingBid))
const buyoutPrice = computed(() => parseDecimalInput(form.value.buyoutPrice))

const fieldErrors = computed(() => {
  const errs = {}
  if (!form.value.name.trim()) errs.name = 'Name is required.'
  if (startingBid.value === null || startingBid.value <= 0) errs.startingBid = 'Starting bid must be greater than 0.'
  if (form.value.buyoutPrice && buyoutPrice.value !== null
      && startingBid.value !== null && buyoutPrice.value <= startingBid.value) {
    errs.buyoutPrice = 'Buyout must be greater than starting bid.'
  }
  return errs
})

const isValid = computed(() => Object.keys(fieldErrors.value).length === 0)

async function submit() {
  submitted.value = true
  if (!isValid.value) return
  submitting.value = true
  error.value = ''
  try {
    const payload = {
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      descriptionAutoGenerated: descriptionAuto.value,
      startingBid: startingBid.value,
      buyoutPrice: settings.value?.allowBuyout ? buyoutPrice.value : null,
      bggIds: sortedSelectedGames.value.map(g => g.bggId)
    }
    
    let savedItem
    if (isEditing.value) {
      savedItem = await auctionStore.updateItem(eventId.value, itemId.value, payload)
    } else {
      savedItem = await auctionStore.saveDraft(eventId.value, payload)
    }

    if (selectedImages.value.length) {
      // For existing items, this just appends new images for now (a full editor might support deleting existing too, but we follow scope).
      await auctionStore.uploadItemImages(
        eventId.value,
        savedItem.id,
        selectedImages.value.map((img) => img.file)
      )
    }
    router.push({ name: 'auction-item', params: { slug: slug.value, itemId: savedItem.id } })
  } catch (err) {
    error.value = err.message || 'Failed to submit item.'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!eventId.value) {
    await eventsStore.loadEventBySlug(slug.value)
  }
  if (!settings.value) await auctionStore.loadAuction(eventId.value)
  
  if (isEditing.value) {
    const item = await auctionStore.loadItem(eventId.value, itemId.value)
    if (item) {
      form.value.name = item.name || ''
      form.value.description = item.description || ''
      form.value.startingBid = String(item.startingBid || '')
      form.value.buyoutPrice = item.buyoutPrice ? String(item.buyoutPrice) : ''
      descriptionAuto.value = item.descriptionAutoGenerated ?? false
      lastAutoText.value = item.description || ''
      selectedGames.value = item.games || []
    }
  }
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'auction', params: { slug: slug } }"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to auction
    </RouterLink>

    <h1 class="text-2xl font-extrabold text-gray-900 mb-1">{{ isEditing ? 'Edit draft' : 'New item draft' }}</h1>
    <p class="text-sm text-gray-500 mb-1">
      This is your private workspace. Nothing is visible to other bidders until you publish.
    </p>
    <p class="text-sm text-gray-500 mb-6">
      Currency: <span class="font-bold text-gray-700">{{ settings?.currency }}</span>
    </p>

    <form
      data-testid="submit-item-form"
      @submit.prevent="submit"
      class="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <BggSearchInput
          v-model="form.name"
          :games="sortedSelectedGames"
          @update:games="selectedGames = $event"
        />
        <p v-if="submitted && fieldErrors.name" class="mt-1 text-xs text-red-600">{{ fieldErrors.name }}</p>
      </div>

      <div
        class="transition-all duration-200 rounded-xl p-4"
        :class="descriptionAuto ? 'bg-indigo-50/40 border-2 border-dashed border-indigo-200' : 'bg-white border border-gray-300'"
      >
        <div class="flex items-center justify-between mb-2">
          <label class="block text-sm font-medium text-gray-700">Description</label>
          <div class="flex items-center gap-2">
            <span
              v-if="descriptionAuto"
              data-testid="submit-item-description-mode-auto"
              class="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09l2.846.813-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              Auto-generated from BoardGameGeek
            </span>
            <span
              v-else
              data-testid="submit-item-description-mode-manual"
              class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
            >
              Your words
            </span>
          </div>
        </div>

        <textarea
          v-model="form.description"
          @input="onDescriptionInput($event.target.value)"
          data-testid="submit-item-description"
          rows="4"
          class="w-full rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 m-0"
          :class="[
            descriptionAuto ? 'border-0 bg-transparent resize-none' : 'border border-gray-300 resize-y',
            submitted && fieldErrors.description ? 'border-red-400' : ''
          ]"
          placeholder="The little details that are vital…"
        />

        <div class="mt-2 flex items-center justify-between">
          <p v-if="descriptionAuto" class="text-xs text-indigo-700">
            This updates as you add or remove games. Edit it to take over — we won't change it again once you do.
          </p>
          <div v-else class="flex flex-col gap-1 w-full text-xs">
            <div class="flex justify-between items-center w-full">
              <p class="text-gray-500">You're editing this yourself now. Adding or removing games won't change the text.</p>
              <button
                v-if="selectedGames.length > 0"
                type="button"
                data-testid="submit-item-description-regenerate"
                @click="regenerateDescription"
                class="text-indigo-600 hover:text-indigo-800 font-medium ml-2 shrink-0 transition-colors"
              >
                Regenerate from games
              </button>
            </div>
            <p v-if="showTakeoverNotice" data-testid="submit-item-description-takeover-notice" class="text-indigo-600 font-medium">
              You're editing this now — we'll leave it alone from here.
            </p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Starting bid <span class="text-red-400">*</span></label>
          <div class="relative">
            <input
              v-model="form.startingBid"
              data-testid="submit-item-starting-bid"
              type="text"
              inputmode="decimal"
              class="w-full rounded-lg border px-3 py-2 pr-12 text-sm focus:ring-2 focus:ring-indigo-500"
              :class="submitted && fieldErrors.startingBid ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
              placeholder="0.00"
            />
            <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-gray-400">
              {{ settings?.currency }}
            </span>
          </div>
          <p v-if="submitted && fieldErrors.startingBid" class="mt-1 text-xs text-red-600">{{ fieldErrors.startingBid }}</p>
        </div>
        <div v-if="settings?.allowBuyout">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            Buyout price <span class="text-gray-400 font-normal">(optional)</span>
          </label>
          <div class="relative">
            <input
              v-model="form.buyoutPrice"
              data-testid="submit-item-buyout"
              type="text"
              inputmode="decimal"
              class="w-full rounded-lg border px-3 py-2 pr-12 text-sm focus:ring-2 focus:ring-indigo-500"
              :class="submitted && fieldErrors.buyoutPrice ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
              placeholder="—"
            />
            <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-gray-400">
              {{ settings?.currency }}
            </span>
          </div>
          <p v-if="submitted && fieldErrors.buyoutPrice" class="mt-1 text-xs text-red-600">{{ fieldErrors.buyoutPrice }}</p>
          <p v-else-if="buyoutPrice" class="mt-1 text-[11px] text-gray-400">
            Buyers can end the auction immediately for {{ formatCurrency(buyoutPrice, settings?.currency) }}.
          </p>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Photos</label>
        <label
          data-testid="submit-item-images-dropzone"
          class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-8 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <svg class="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span class="text-sm text-gray-600">Click to upload or drop images here</span>
          <input type="file" accept="image/*" multiple class="hidden" @change="onFiles" />
        </label>
        <p class="mt-2 text-xs text-gray-500">Saved to your draft. You can publish when you're ready.</p>

        <div v-if="selectedImages.length" class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            v-for="(img, i) in selectedImages"
            :key="i"
            :data-testid="`submit-item-image-${i}`"
            class="relative rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm group"
          >
            <img :src="img.previewUrl" :alt="`Image ${i + 1}`" class="w-full h-24 object-cover" />
            <div class="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 flex items-center justify-between text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <div class="flex gap-1">
                <button type="button" @click="moveImage(i, -1)" :disabled="i === 0" class="disabled:opacity-30">↑</button>
                <button type="button" @click="moveImage(i, 1)" :disabled="i === selectedImages.length - 1" class="disabled:opacity-30">↓</button>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  :data-testid="`submit-item-image-edit-${i}`"
                  @click="editImage(i)"
                  class="text-indigo-200 hover:text-white"
                  aria-label="Edit image"
                  title="Edit"
                >
                  ✎ Edit
                </button>
                <button
                  type="button"
                  :data-testid="`submit-item-image-remove-${i}`"
                  @click="removeImage(i)"
                  class="text-rose-200 hover:text-white"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ImageCropper
        v-if="currentPendingFile"
        :image-file="currentPendingFile"
        shape="rectangle"
        title="Crop Item Image"
        @crop="onCropDone"
        @cancel="onCropCancel"
      />

      <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {{ error }}
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button
          type="submit"
          data-testid="save-draft-button"
          :disabled="submitting || (submitted && !isValid)"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ submitting ? 'Saving…' : (isEditing ? 'Save changes' : 'Save draft') }}
        </button>
        <RouterLink
          :to="{ name: 'auction', params: { slug: slug } }"
          class="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </RouterLink>
      </div>
    </form>
  </div>
</template>
