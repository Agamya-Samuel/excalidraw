# Upstream sync

Remote model:

- `upstream` = `git@github.com:excalidraw/excalidraw.git` (read-only source of truth)
- `origin` = `git@github.com:Agamya-Samuel/excalidraw.git` (your fork)

Branch model:

- `master` mirrors `upstream/master` exactly. Never commit to it.
- `feat/cloud-workspace` holds every fork change and merges `master`.

## One-time setup

```sh
git remote rename origin upstream
git remote add origin git@github.com:Agamya-Samuel/excalidraw.git
git fetch upstream --prune --tags
git fetch origin --prune

git checkout master
git branch --set-upstream-to=upstream/master master
git config branch.master.pushRemote origin
git config branch.master.mergeOptions "--ff-only"
git merge --ff-only upstream/master
git push origin master
```

## Routine sync

```sh
git fetch upstream --prune --tags

# 1. update the mirror
git checkout master
git merge --ff-only upstream/master
git push origin master

# 2. converge the feature branch
git checkout feat/cloud-workspace
git merge --no-ff master -m "merge: sync upstream master into feat/cloud-workspace"

# 3. resolve conflicts (see below), then verify
yarn install
yarn test:typecheck
yarn test:app run
yarn workspace server build

git push origin feat/cloud-workspace
```

## Conflict policy

- `server/**`, `cloud/**`, `auth/**`, `data/remote.ts`, `lib/api.ts`, `nginx.conf`, Docker files: keep ours.
- `App.tsx`, `collab/Collab.tsx`: keep our cloud/collab behavior and port upstream's non-Firebase changes by hand.
- `data/firebase.ts`, `data/firebaseSDK.ts`, `tests/firebase.test.ts`: keep deleted. This fork uses the custom backend instead of Firebase.
- `package.json` files: merge both sides; remove any reintroduced `firebase`/`@supabase/supabase-js`.
- `yarn.lock`: never hand-resolve. Take either side, then run `yarn install`.
- `vercel.json`: keep upstream rewrites plus `/dashboard` and `/d/:path*`.
- `appRoutes.test.ts`: cloud rewrites are intentionally extra; keep the `arrayContaining` assertion.
- PWA: cloud paths live in `navigateFallbackAllowlist` in `vite.config.mts`.

## Verify

```sh
git merge-base --is-ancestor upstream/master master && echo mirror-ok
git log --oneline feat/cloud-workspace..master   # must be empty
git grep -n '^<<<<<<<'                            # must be empty
git grep -ni firebase -- excalidraw-app          # must be empty
```

The CJK export test (`packages/excalidraw/tests/scene/export.test.ts`) can exceed its 30s timeout under full-suite load; it passes in isolation.
