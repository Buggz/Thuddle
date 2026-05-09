<script setup>
defineProps({
  tabs: { type: Array, required: true },
  activeKey: { type: String, required: true }
})

const emit = defineEmits(['update:activeKey'])
</script>

<template>
  <!-- Wrapper provides the right-edge scroll hint on mobile -->
  <div class="relative">
    <!-- Gradient hint — visible only on mobile when content overflows -->
    <div
      class="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-2xl z-10
             bg-linear-to-l from-gray-100 to-transparent"
      aria-hidden="true"
    />

    <nav
      class="flex gap-2 p-1.5 bg-gray-100/80 border border-gray-200/60 rounded-2xl
             overflow-x-auto snap-x
             sm:flex-wrap sm:overflow-visible sm:w-fit"
      aria-label="Tabs"
    >
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :data-testid="tab.testid ?? `event-tab-${tab.key}`"
        type="button"
        @click="emit('update:activeKey', tab.key)"
        class="flex items-center shrink-0 snap-start px-5 py-2.5 text-sm font-bold rounded-xl
               transition-all duration-200 ease-out"
        :class="activeKey === tab.key
          ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200/50'
          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-200/50'"
      >
        <span v-if="tab.icon" class="mr-1.5" aria-hidden="true">{{ tab.icon }}</span>
        {{ tab.label }}
        <!-- Named badge slot — parent injects per-tab content; fallback uses badge prop -->
        <slot name="badge" :tab="tab">
          <span
            v-if="tab.badge"
            class="ml-2"
            :class="tab.badgeClass"
          >{{ tab.badge }}</span>
        </slot>
      </button>
    </nav>
  </div>
</template>
