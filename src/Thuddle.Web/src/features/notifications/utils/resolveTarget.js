/**
 * Resolves a backend notification object to a vue-router location (or null).
 * Maps by `entityType` — the canonical field the backend now sends.
 */
export function resolveNotificationTarget(notification) {
  const { entityType, eventId, entityId, secondaryEntityId } = notification

  switch (entityType) {
    case 'AuctionItem':
      if (!eventId || !entityId) {
        console.warn('[resolveNotificationTarget] AuctionItem missing eventId or entityId', notification)
        return null
      }
      return { name: 'auction-item', params: { id: eventId, itemId: entityId } }

    case 'Event':
      if (!entityId) {
        console.warn('[resolveNotificationTarget] Event missing entityId', notification)
        return null
      }
      return { name: 'event', params: { id: entityId } }

    case 'DiscussionPost':
      if (!eventId || !entityId) {
        console.warn('[resolveNotificationTarget] DiscussionPost missing eventId or entityId', notification)
        return null
      }
      return { name: 'event', params: { id: eventId }, hash: `#post-${entityId}` }

    case 'DiscussionComment':
      if (!eventId || !secondaryEntityId) {
        console.warn('[resolveNotificationTarget] DiscussionComment missing eventId or secondaryEntityId', notification)
        return null
      }
      return { name: 'event', params: { id: eventId }, hash: `#comment-${secondaryEntityId}` }

    case 'EventInvitation':
      if (!entityId) {
        console.warn('[resolveNotificationTarget] EventInvitation missing entityId', notification)
        return null
      }
      // No dedicated event-invitation route exists; navigate to the event itself.
      return { name: 'event', params: { id: entityId } }

    case 'ContactGroup':
      // No per-group route exists in the router; navigate to the groups listing.
      return { name: 'groups' }

    case 'Raffle':
      if (!eventId) {
        console.warn('[resolveNotificationTarget] Raffle missing eventId', notification)
        return null
      }
      return { name: 'event', params: { id: eventId }, hash: '#raffles' }

    case 'EventActivity':
      if (!eventId) {
        console.warn('[resolveNotificationTarget] EventActivity missing eventId', notification)
        return null
      }
      return { name: 'event', params: { id: eventId }, hash: '#activities' }

    default:
      return null
  }
}
