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
        path: '/groups',
        name: 'groups',
        component: () => import('@/features/groups/views/GroupsView.vue'),
        meta: { requiresAuth: true, requiredPermission: 'groups:manage' }
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
      },
      {
        path: '/admin',
        name: 'admin',
        component: () => import('@/features/admin/views/AdminView.vue'),
        meta: { requiresAuth: true, requiredPermission: 'admin:access' }
      }
    ]
  })

  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      auth.login(to.fullPath)
      return false
    }

    if (to.meta.requiredPermission) {
      const permissions = usePermissionsStore()
      // Wait for permissions to finish loading before checking.
      // Without this, direct navigation (e.g. page reload on /admin) can
      // race the async permission load and incorrectly redirect to /.
      if (auth.isAuthenticated && !permissions.loaded) {
        await permissions.load()
      }
      if (!permissions.hasPermission(to.meta.requiredPermission)) {
        return { path: '/' }
      }
    }
  })

  return router
}
