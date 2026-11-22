# Cloud workspace — production checklist (external / deferred)

The Supabase cloud workspace code is implemented. This file tracks the work that
is **external configuration or a separate project**, intentionally not part of the
current code changes.

## 1. Auth URL configuration

Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `http://localhost:3001` for dev; the production origin for prod.
- Redirect URLs: `http://localhost:3001/**` and `https://<prod-domain>/**`.
- Confirm the email confirmation link points at the app origin.

## 2. Email (SMTP)

The built-in sender is limited to roughly 2 emails/hour and is not production-safe.

1. Create a Resend/Brevo/SES account and verify the sending domain.
2. Supabase Dashboard → Authentication → SMTP: host, port, user, password,
   sender name/email.
3. Test signup confirmation and password reset.
4. Keep “Confirm email” enabled in production; disable it only for local testing.

## 3. Google / GitHub OAuth

For each provider in Authentication → Providers:

- Google: create an OAuth client in Google Cloud Console. Authorized redirect URI:
  `https://<project-ref>.supabase.co/auth/v1/callback`. Paste Client ID/Secret.
- GitHub: create an OAuth App with the same callback. Request `user:email` so the
  app receives a verified email address.
- Enable the provider in Supabase.
- Verify the app dialog’s Google/GitHub buttons complete the redirect and return
  to `/dashboard`.

## 4. Production deploy (Vercel)

- Set `VITE_APP_SUPABASE_URL`, `VITE_APP_SUPABASE_ANON_KEY` (publishable key only),
  and `VITE_APP_CLOUD_ENABLED=true` in the Vercel project.
- Keep `.env.production` free of secrets. The client is a pure SPA; it must never
  receive the service-role/secret key or the database password.
- `vercel.json` already rewrites `/dashboard` and `/d/*` to the SPA. Verify deep
  links on the deployed domain (not only on `/`).
- Add the production origin to Supabase Auth redirect URLs and to any edge/CORS
  configuration.
- Verify the room/collab server URL (`VITE_APP_WS_SERVER_URL`) points at the
  production room server.

## 5. Secret rotation (do this once now)

The database password and a `sb_secret_…` key were shared in chat.

1. Supabase Dashboard → Project Settings → Database → Reset database password.
   Update `SUPABASE_DB_URL` locally and in any CI secret store.
2. Project Settings → API Keys → roll the secret key; revoke the old one.
3. The browser only needs the publishable key. Remove the secret key and JWKS URL
   from every client env and repository file.
4. Rotate any access tokens or CLI sessions that used the old credentials.
5. Re-run `supabase db push` / `supabase test db` with the new database password.

## 6. Public-link revocation and key rotation

Implemented: disabling a public link sets `documents.is_public = false`. Old links
fail on the next load; already-open tabs keep the copy they decrypted. Re-enabling
reuses the same `room_key`, so a leaked link becomes valid again.

Rotation is **not implemented** and is a separate flow:

1. Require the owner and ensure no active collaborators (or add a key-epoch check
   to `save_doc_scene` so stale-key writes are rejected).
2. Generate a new `room_key`.
3. Download/decrypt `doc_scenes.blob` with the old key, re-encrypt with the new
   key, update `documents.room_key` and the scene row in one operation.
4. Re-encrypt every image under `docs/<docId>/` (download → decrypt → encrypt →
   upload). This is a background job with progress; old copies already downloaded
   by viewers cannot be revoked cryptographically.
5. Force collaborators to reload so they fetch the new key.
6. Thumbnails are plaintext PNGs; deleting/replacing them is a separate step.

## 7. Billing, quotas, backups

- Free tier pauses after inactivity and is not suitable for public share links.
  Move to Pro before launch.
- Enable the spend cap and alerts; watch Storage, egress, Realtime messages, and
  database size.
- Enable daily backups (PITR if boards become business-critical) and perform one
  restore drill.
- Monitor `documents`, `doc_scenes`, Storage objects, and Realtime usage.

## 8. Old Firebase Storage objects (optional)

Only needed if old share links must keep their images.

- Copy `files/rooms/**` and `files/shareLinks/**` from Firebase Storage to the
  Supabase `excalidraw` bucket, preserving paths.
- Old scene JSON still loads from `json.excalidraw.com`; no migration is needed
  for those snapshots beyond their image files.
- Run as a one-off admin job; do not add Firebase to the client bundle.

## 9. Abuse controls

- Add Turnstile (or equivalent) to signup/sign-in.
- Supabase Auth has built-in rate limits; configure them for production.
- Consider quotas/rate limits for anonymous `scenes` and public-link traffic.
- Monitor for unusually large scene/blob sizes and uploads.

## 10. Self-hosting (alternative to Pro)

- Run Supabase via Docker; you own SMTP, backups, upgrades, and uptime.
- Keep the same client env (URL + publishable key); self-hosted requires no client
  code changes.
- Add object-storage backups and a restore runbook.

## Launch verification

- [ ] Signup confirmation and password reset arrive through the production SMTP.
- [ ] Google and GitHub sign-in return to `/dashboard`.
- [ ] Production deep links (`/dashboard`, `/d/<id>`) work on a hard reload.
- [ ] Only the publishable key is present in the deployed JS/env.
- [ ] The old database password and secret key are revoked.
- [ ] Public-link disable behaves as documented; rotation runbook reviewed.
- [ ] Spend cap, backups, and alerts are configured.
- [ ] `yarn test:typecheck`, `yarn test:app`, the production build, and pgTAP pass in CI.
