import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/features/auth/stores/auth'
import { usePermissionsStore } from '@/features/auth/stores/permissions'
import { useFeatureFlags } from '@/shared/featureFlags'

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
        path: '/events/:id/auction',
        name: 'auction',
        component: () => import('@/features/auctions/views/AuctionView.vue'),
        meta: { featureFlag: 'auctions' }
      },
      {
        path: '/events/:id/auction/items/new',
        name: 'auction-submit',
        component: () => import('@/features/auctions/views/SubmitAuctionItemView.vue'),
        meta: { requiresAuth: true, featureFlag: 'auctions' }
      },
      {
        path: '/events/:id/auction/items/:itemId/edit',
        name: 'auction-edit',
        component: () => import('@/features/auctions/views/SubmitAuctionItemView.vue'),
        meta: { requiresAuth: true, featureFlag: 'auctions' }
      },
      {
        path: '/events/:id/auction/items/:itemId',
        name: 'auction-item',
        component: () => import('@/features/auctions/views/AuctionItemView.vue'),
        meta: { featureFlag: 'auctions' }
      },
      {
        path: '/events/:id/auction/settings',
        name: 'auction-settings',
        component: () => import('@/features/auctions/views/AuctionSettingsView.vue'),
        meta: { requiresAuth: true, featureFlag: 'auctions' }
      },
      {
        path: '/events/:id/auction/moderation',
        name: 'auction-moderation',
        component: () => import('@/features/auctions/views/ModerationQueueView.vue'),
        meta: { requiresAuth: true, featureFlag: 'auctions' }
      },
      {
        path: '/events/:id/raffles/:raffleId/present',
        name: 'raffle-present',
        component: () => import('@/features/events/raffles/RafflePresentationView.vue'),
        meta: { requiresAuth: true, fullscreen: true }
      },
      {
        path: '/notifications',
        name: 'notifications',
        component: () => import('@/features/notifications/views/NotificationsView.vue'),
        meta: { requiresAuth: true, featureFlag: 'notifications' }
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
    if (to.meta.featureFlag) {
      const flags = useFeatureFlags()
      if (!flags[to.meta.featureFlag]?.value) {
        return { path: '/' }
      }
    }

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
