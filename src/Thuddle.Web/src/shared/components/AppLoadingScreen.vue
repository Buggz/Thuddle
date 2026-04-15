<script setup>
import PhaseSpinner from '@/shared/components/PhaseSpinner.vue'
import FunnyLoader from '@/shared/components/FunnyLoader.vue'
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50">
    <div class="flex flex-col items-center gap-8 animate-fade-in">
      <!-- Logo -->
      <h1 class="text-5xl sm:text-6xl font-extrabold tracking-tight text-indigo-600 select-none">
        Thuddle
      </h1>

      <!-- Spinner -->
      <PhaseSpinner size="lg" />

      <!-- Funny messages -->
      <FunnyLoader title="Getting things ready" :delay="2500" />
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fade-in 0.5s ease-out both;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
