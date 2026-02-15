import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth) {
    const { useAuthStore } = await import('@/stores/auth')
    const auth = useAuthStore()
    if (!auth.isAuthenticated) {
      auth.login()
      return false
    }
  }
})

export default router
