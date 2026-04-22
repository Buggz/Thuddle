import { computed } from 'vue'

export function usePublishOutcome(auctionStatus, moderationPolicy, isAdmin, secondsToStart) {
  const resultingStatus = computed(() => {
    const status = auctionStatus.value
    const policy = moderationPolicy.value
    const admin = isAdmin.value

    if (status === 'Ended') return 'Rejected'
    if (status === 'Live') {
      return (admin || policy === 'AutoApprove') ? 'Live' : 'PendingApproval'
    }
    // Scheduled or Draft
    return (admin || policy === 'AutoApprove') ? 'Scheduled' : 'PendingApproval'
  })

  const headline = computed(() => {
    const status = auctionStatus.value
    const policy = moderationPolicy.value
    const admin = isAdmin.value

    if (status === 'Ended') return 'Auction Ended'
    if (status === 'Live') {
      return (admin || policy === 'AutoApprove') ? 'Publish now' : 'Submit for approval'
    }
    return (admin || policy === 'AutoApprove') ? 'Publish' : 'Submit for approval'
  })

  const body = computed(() => {
    const status = auctionStatus.value
    const policy = moderationPolicy.value
    const admin = isAdmin.value

    if (status === 'Ended') {
      return 'This auction has ended. Publishing is no longer available.'
    }

    if (status === 'Live') {
      if (admin || policy === 'AutoApprove') {
        return 'Your item will go live immediately and be visible to all bidders.'
      } else {
        return 'A host will review your item before it appears on the bidding floor.'
      }
    }

    // Scheduled or Draft
    if (admin || policy === 'AutoApprove') {
      return status === 'Draft'
        ? 'Your item will be queued. It will become visible once a host schedules and starts the auction.'
        : 'Your item will go live when the auction starts in {countdown}.'
    } else {
      return status === 'Draft'
        ? 'A host will review your item. Once approved, it will be queued until the auction is scheduled and started.'
        : 'A host will review your item. Once approved, it will go live when the auction starts in {countdown}.'
    }
  })

  const confirmLabel = computed(() => {
    const status = auctionStatus.value
    const policy = moderationPolicy.value
    const admin = isAdmin.value

    if (status === 'Ended') return 'Publish'
    if (status === 'Live') {
      return (admin || policy === 'AutoApprove') ? 'Publish now' : 'Submit for approval'
    }
    return (admin || policy === 'AutoApprove') ? 'Publish' : 'Submit for approval'
  })

  return {
    resultingStatus,
    headline,
    body,
    confirmLabel
  }
}
