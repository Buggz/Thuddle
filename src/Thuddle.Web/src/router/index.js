import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { usePermissionsStore } from '@/features/auth/stores/permissions'

export default function initRouter() {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
      {
        path: '/',
        name: 'home',
        component: () => import('@/features/dashboard/views/DashboardView.vue')
      },
      {
        path: '/profile',
        name: 'profile',
        component: () => import('@/features/profile/views/ProfileView.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: '/events/create',
        name: 'create-event',
        component: () => import('@/features/events/views/CreateEventView.vue'),
        meta: { requiresAuth: true }
      },
      {
        path: '/events/:id',
        name: 'event',
        component: () => import('@/features/events/views/EventView.vue')
      },
      {
        path: '/events/:id/manage',
        name: 'manage-event',
        component: () => import('@/features/events/views/ManageEventView.vue'),
        meta: { requiresAuth: true }
      }
    ]
  })

  router.beforeEach((to) => {
    const auth = useAuthStore()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      auth.login(to.fullPath)
      return false
    }

    if (auth.isAuthenticated && to.name !== 'profile') {
      const perms = usePermissionsStore()
      if (perms.loaded && !perms.profileComplete) {
        return { name: 'profile' }
      }
    }
  })

  return router
}
