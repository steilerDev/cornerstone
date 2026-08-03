# API Client Shapes & Routing Patterns

## UserResponse Shape

`id`, `email`, `displayName`, `role`, `authProvider`, `createdAt`, `updatedAt?`, `deactivatedAt?`
Filter active users: `!u.deactivatedAt` (NOT `u.isActive` — that field does not exist)

## Auth Routes

`/setup` and `/login` are outside AppShell (no sidebar). AuthGuard wraps AppShell.
AuthContext: `user`, `oidcEnabled`, `isLoading`, `error`, `refreshAuth()`, `logout()`

## PaginatedResponse shape

`{ items: T[], pagination: { page, pageSize, totalItems, totalPages } }` (NOT `total`).

## Direction-swapped API calls (dependencies)

API `createDependency(successorId, { predecessorId })` / `deleteDependency(successorId, predecessorId)`.
To express "this item BLOCKS another": `createDependency(otherItemId, { predecessorId: thisItemId })`.
To delete a successor dep: `deleteDependency(successorItem.id, currentItemId)`.

## Navigation Origin Pattern

Pass origin state: `navigate('/work-items/${id}', { state: { from: 'timeline' } })`
Read in destination: `const fromTimeline = (location.state as { from?: string } | null)?.from === 'timeline'`
