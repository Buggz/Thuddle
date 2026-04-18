<script setup>
import { ref, computed, shallowRef, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuctionStore } from '@/features/auctions/stores/auction'
import { parseDecimalInput, formatCurrency } from '@/shared/formatCurrency'

const route = useRoute()
const router = useRouter()
const auctionStore = useAuctionStore()

const eventId = computed(() => String(route.params.id))
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

// Image management — selected before save, uploaded one by one after.
const selectedImages = ref([])  // { file, previewUrl }

function onFiles(event) {
  const files = Array.from(event.target.files || [])
  for (const file of files) {
    selectedImages.value.push({
      file,
      previewUrl: URL.createObjectURL(file)
    })
  }
  event.target.value = ''
}

function removeImage(idx) {
  const removed = selectedImages.value.splice(idx, 1)[0]
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
}

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
    const created = await auctionStore.submitItem(eventId.value, {
      name: form.value.name.trim(),
      description: form.value.description.trim() || null,
      startingBid: startingBid.value,
      buyoutPrice: settings.value?.allowBuyout ? buyoutPrice.value : null
    })
    if (selectedImages.value.length) {
      await auctionStore.uploadItemImages(
        eventId.value,
        created.id,
        selectedImages.value.map((img) => img.file)
      )
    }
    router.push({ name: 'auction-item', params: { id: eventId.value, itemId: created.id } })
  } catch (err) {
    error.value = err.message || 'Failed to submit item.'
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!settings.value) await auctionStore.loadAuction(eventId.value)
})
</script>

<template>
  <div class="max-w-3xl mx-auto">
    <RouterLink
      :to="{ name: 'auction', params: { id: eventId } }"
      class="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to auction
    </RouterLink>

    <h1 class="text-2xl font-extrabold text-gray-900 mb-1">Submit an item</h1>
    <p class="text-sm text-gray-500 mb-6">
      Currency: <span class="font-bold text-gray-700">{{ settings?.currency }}</span>
    </p>

    <form
      data-testid="submit-item-form"
      @submit.prevent="submit"
      class="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Item name <span class="text-red-400">*</span></label>
        <input
          v-model="form.name"
          data-testid="submit-item-name"
          type="text"
          class="w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
          :class="submitted && fieldErrors.name ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'"
          placeholder="A signed first edition…"
        />
        <p v-if="submitted && fieldErrors.name" class="mt-1 text-xs text-red-600">{{ fieldErrors.name }}</p>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          v-model="form.description"
          data-testid="submit-item-description"
          rows="4"
          class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          placeholder="The little details that are vital…"
        />
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

      <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
        {{ error }}
      </div>

      <div class="flex items-center gap-3 pt-2">
        <button
          type="submit"
          data-testid="submit-item-save-btn"
          :disabled="submitting || (submitted && !isValid)"
          class="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {{ submitting ? 'Submitting…' : 'Submit item' }}
        </button>
        <RouterLink
          :to="{ name: 'auction', params: { id: eventId } }"
          class="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </RouterLink>
      </div>
    </form>
  </div>
</template>
