// Mirror of src/Thuddle.Api/Data/FeatureKeys.cs. Keys MUST match exactly.
export const FeatureKeys = Object.freeze({
  Raffles: 'raffles',
  Auction: 'auction',
  Activities: 'activities'
})

export const EVENT_FEATURES = [
  {
    key: FeatureKeys.Auction,
    label: 'Auction',
    icon: '🔨',
    description: 'Live bidding on items contributed by you or your attendees.'
  },
  {
    key: FeatureKeys.Raffles,
    label: 'Raffles',
    icon: '🎟️',
    description: 'Ticket-based prize draws — great for door prizes or charity.'
  },
  {
    key: FeatureKeys.Activities,
    label: 'Activities',
    icon: '📋',
    description: 'Schedulable sub-events attendees can sign up for: tournaments, quizzes, workshops.'
  }
]

export function getFeatureMeta(key) {
  return EVENT_FEATURES.find((f) => f.key === key) ?? null
}
