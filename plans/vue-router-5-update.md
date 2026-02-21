# Vue Router 4 to 5 Update Plan

## Official migration stance

From [Vue Router's migration guide](https://router.vuejs.org/guide/migration/v4-to-v5):

> If you're using Vue Router 4 **without** unplugin-vue-router, there are **no breaking changes** — you can upgrade without any code modifications.

This project uses standard Vue Router 4 only: `createRouter`, `createWebHistory`, a static `routes` array, `router.beforeEach`, and the usual `useRouter` / `useRoute` / `<RouterLink>` / `<RouterView>` usage. There is **no** unplugin-vue-router, no file-based routing, and no references to `vue-router/vite` or `vue-router/unplugin`. The only documented exception (IIFE build and `@vue/devtools-api`) does not apply because the client is built with Vite.

## Current usage (confirmed)

- **Router config:** [frontend-root/src/router/index.ts](frontend-root/src/router/index.ts) — `createRouter`, `createWebHistory()`, four routes (`home`, `booking-wizard`, `admin-panel`, `beta-feedback`), one `beforeEach` (admin metadata prefetch).
- **Registration:** [frontend-root/src/main.ts](frontend-root/src/main.ts) — `app.use(router)`.
- **Navigation:** `useRouter()` / `router.push()` in composables and views; `<RouterLink>` and `<RouterView>` in layouts and App.
- **Types:** Imports from `'vue-router'` and `type { RouteRecordRaw, RouteLocationNormalized }` — all remain valid in v5.

No code changes are required for the upgrade itself.

## Pre-existing gap (optional follow-up)

Several `router.push({ name: '...' })` calls use route names that are **not** defined in the router (e.g. `part-types-list`, `part-type-create`, `block-type-edit`, `part-instance-edit`, etc.). Only `home`, `booking-wizard`, `admin-panel`, and `beta-feedback` exist. That can lead to navigation to non-matching routes (e.g. 404 or fallback). Addressing this is **out of scope** for the Vue Router 5 upgrade; the plan below only upgrades the dependency and verifies behavior.

## Implementation steps

### 1. Upgrade the dependency

In the client directory:

```bash
cd client && npm install "vue-router@^5.0.0"
```

Use the same quoting as in the Express/vitest upgrades to avoid shell expansion of `^`.

### 2. Verification

Run in order:

1. **TypeScript:** `cd client && npx vue-tsc --noEmit` (or `npm run type-check` if it runs vue-tsc).
2. **Build:** `cd client && npm run build` — ensures the app compiles with Vue Router 5.
3. **Lint:** `cd client && npm run lint`.
4. **Dev server:** `cd client && npm run dev` — confirm the app loads and that navigation works (e.g. Home, Booking, Admin, Beta Feedback).
5. **Dep-freshness:** `cd client && npm run audit:dep-freshness` — confirm vue-router is no longer in the "major behind" list (expected: 6 → 5 outdated).

### 3. Optional smoke checks

- Click between main nav items (/, /booking, /admin, /beta-feedback).
- From Admin, trigger any navigation that uses `router.push` (e.g. list/create/edit flows if they point to defined routes).
- Confirm the admin metadata prefetch in `beforeEach` still runs when entering `/admin` (no console errors, admin panel loads).

## Rollback

If anything breaks, revert the dependency:

```bash
cd client && npm install "vue-router@^4.6.0"
```

No application code will have been changed, so rollback is dependency-only.

## Summary

| Item | Action |
|------|--------|
| [frontend-root/package.json](frontend-root/package.json) | Bump `vue-router` to `^5.0.0` via `npm install` |
| Application code | None |
| Verification | type-check, build, lint, dev, dep-freshness audit |

## To-dos (for execution)

1. Run `npm install "vue-router@^5.0.0"` in frontend-root/.
2. Run type-check and build in client to verify compilation.
3. Run lint and start dev server; confirm navigation works.
4. Re-run dep-freshness audit and confirm vue-router no longer outdated.
