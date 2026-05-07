# Raffle e2e test fixes after `feature/raffle-improvements`

## Root causes (confirmed via instrumented run)

### 1. Auto-expand watcher races with test clicks
`RafflesSection.vue` has `watch(eventRaffles, ..., { immediate: true })` that auto-expands the only raffle. Tests that ALSO `getByTestId('raffle-card-{id}').click()` after `gotoManageRafflesTab` end up TOGGLING THE PANEL CLOSED.

Symptom: lockBtn appears visible (because `<Transition name="slide">` keeps DOM during leave) but child `ConfirmDialog` has already unmounted, so clicking lockBtn updates a ref on a dead component and dialog never appears.

**Fix**: Remove the explicit `raffle-card-{id}.click()` after `gotoManageRafflesTab`. Instead `await expect(getByTestId('raffle-draw-stage-btn').or(getByTestId('raffle-lock-submissions-btn'))).toBeVisible()` to wait for auto-expand to complete.

### 2. Participant tests missing tab click
Tests in `raffle-auto-expand.spec.ts`, `raffle-description-render.spec.ts`, `realtime-multi-user.spec.ts:85` go to `/events/{id}` but never click `event-tab-raffles`. RafflesSection only mounts when that tab is active.

**Fix**: After `event-joined-badge`, `await alicePage.getByTestId('event-tab-raffles').click()`.

### 3. Removed testids
`raffle-start-btn` and `raffle-draw-btn` are gone. Replaced by `raffle-draw-stage-btn` (in console) which navigates to presentation, where `raffle-present-draw-btn` performs the draw.

**Fix**: For tests that just need Drawing state, call `startRaffleApi` directly.

## Files affected
- Auto-expand: entries-alphabetical, raffle-entries-filter, host-edit-tickets-after-start, manage-entries:16/:216, lock-submissions-confirm, new-features:77/:119
- Tab missing: raffle-auto-expand, raffle-description-render, realtime-multi-user:85
- Removed testids: start-and-draw, presentation-mode, create-edit-raffle:82, negative-permissions:173, draw-only-from-presentation
