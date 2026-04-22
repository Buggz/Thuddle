# Gandalf Workflow Preferences

## Parallel Delegation
- House (backend) and Poirot (frontend) are dispatched simultaneously, not sequentially.
- Gandalf defines a clear API contract (endpoints, request/response shapes, authorization policies, SignalR events) before delegating.
- Both agents work off that shared contract so they don't depend on each other's output.

## E2E Tests Are Deferred
- Columbo (e2e testing) is NOT activated as part of the initial feature implementation.
- Gandalf still includes `data-testid` requirements in frontend tasks so Poirot adds them during implementation.
- E2E tests are only written after the user has verified the feature locally and explicitly requests them.

## Vertical Slicing
- Large features must be broken into small, independently deliverable subtasks before any delegation happens.
- Each subtask should be a vertical slice: one coherent piece of functionality across backend and frontend that the user can see and verify on its own.
- Prefer slicing by what the user sees — a page, a form, a single interaction — rather than by technical layer.
- Gandalf presents the list of subtasks to the user for approval before dispatching any agents.
- Each subtask gets its own delegation round (House + Poirot in parallel), not one giant plan covering the entire feature.
