# Story #470 User Preferences Infrastructure Tests (2026-03-09)

## Test Files Created

- `server/src/services/preferencesService.test.ts` — 14 unit tests (in-memory SQLite)
- `server/src/routes/preferences.test.ts` — 18 integration tests (app.inject)
- `client/src/lib/preferencesApi.test.ts` — 12 unit tests (apiClient mock)
- `client/src/hooks/usePreferences.test.ts` — 16 unit tests (renderHook)
- `client/src/contexts/ThemeContext.test.tsx` — 16 unit tests (render + jsdom)

## Key Patterns

### preferencesService test pattern
- Uses `drizzle(new Database(':memory:'))` + `runMigrations()`
- Insert user via `db.insert(schema.users).values({...}).run()` before each test
- `userPreferences` table uses integer PK (not UUID), with `userId + key` UNIQUE index

### routes/preferences test pattern
- `buildApp()` with temp dir DATABASE_URL
- `createLocalUser()` + `createSession()` helper pattern (same as documentLinks.test.ts)
- Routes registered at `/api/users/me/preferences` (prefix in app.ts)
- PATCH returns `{ preference: UserPreference }`, GET returns `{ preferences: UserPreference[] }`
- DELETE `/:key` with URL-encoded key in path

### preferencesApi test pattern
- Mocks `./apiClient.js` (get, patch, del)
- `listPreferences()` calls GET `/users/me/preferences`, returns `r.preferences`
- `upsertPreference(key, value)` calls PATCH `/users/me/preferences`, returns `r.preference`
- `deletePreference(key)` calls DELETE `/users/me/preferences/${encodeURIComponent(key)}`

### ThemeContext test pattern
- `@jest-environment jsdom` directive required
- Mock `../lib/preferencesApi.js` (listPreferences, upsertPreference, deletePreference)
- Dynamic import with `if (!ThemeProvider)` guard for module-level caching
- `localStorage.clear()` + `delete document.documentElement.dataset.theme` in beforeEach
- `syncWithServer` sets `authenticatedUserIdRef` so subsequent `setTheme()` calls upsert to server
- The `setTheme` → `upsertPreference` call is fire-and-forget; test must `await waitFor(...)` after click

## Git Branch Conflict Note

The worktree's local branch had BOTH server+frontend in one commit (`945c463`)
while the remote branch had only the frontend commit (`b970b48`). Resolution:
- `git reset --hard origin/feat/470-user-prefs-infra` (to align with remote)
- `git cherry-pick 945c463` (to restore server-side production files)
- Then re-create and commit the test files
