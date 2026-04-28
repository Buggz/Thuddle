# Raffle realtime bugs to investigate

Two suspected product bugs surfaced by the raffle e2e suite. Tests have been
left as-is (not "fixed") so they continue to catch the regression.

## 1. Participant Winners list never appears after a fresh draw
- **Test**: `tests/e2e/raffles/new-features.spec.ts` — "participant sees Winners list under raffle card after a draw" (~line 17)
- **Symptom**: Alice expands the raffle card and expects `[data-testid="raffle-participant-winners"]`, but the testid never renders.
- **Suspected cause**: `RaffleParticipantView.vue` (~L58–62) only calls `store.fetchDraws(raffleId)` when `props.raffle?.drawCount > 0`. The raffles list returned from `GET /api/events/{id}/raffles` for Alice's freshly-loaded page may not include the latest `drawCount`, so the fetch never fires and `draws.length` stays 0 (the `v-if` for `raffle-participant-winners` never becomes true).
- **Where to look**: `Endpoints/RaffleEndpoints.cs` raffle-list projection (does it include `drawCount`?) and the SignalR `RaffleDrawCompleted` handler in the raffles store (does it bump `drawCount` on the cached raffle for non-host viewers?).

## 2. Alice never sees `raffle-winner-reveal` in presentation mode
- **Test**: `tests/e2e/raffles/realtime-multi-user.spec.ts` — "admin draws, both users see winner reveal with same winner name" (~line 15)
- **Symptom**: Both admin and Alice are on `/events/:id/raffles/:raffleId/present`. Admin's `raffle-winner-reveal` becomes visible after draw; Alice's never does. Other realtime tests in the same file pass, so SignalR is connected.
- **Suspected cause**: Either the server only broadcasts `RaffleWinnerRevealed` to a group Alice has not joined (e.g. host-only group, or event group she's joined to but the reveal goes elsewhere), OR the raffles store handler only sets `pendingReveal` for the user who initiated the draw, leaving non-host presentation viewers without the trigger.
- **Where to look**: `Realtime/RaffleHub.cs` (or equivalent) for the broadcast target group, and the raffles store SignalR handler that sets `pendingReveal`.
