import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/features/auth/stores/auth'

export default function initRouter() {
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
        component: () => import('@/features/dashboard/views/DashboardView.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: '/profile',
        name: 'profile',
        component: () => import('@/features/profile/views/ProfileView.vue'),
        meta: { requiresAuth: true }
      }
    ]
  })

  router.beforeEach((to) => {
    if (to.meta.requiresAuth) {
      const auth = useAuthStore()
      if (!auth.isAuthenticated) {
        auth.login(to.fullPath)
        return false
      }
    }
  })

  return router
}
