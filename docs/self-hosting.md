# Self-hosting the cloud workspace

This fork replaces Supabase with a self-contained stack:

| Service | Role |
| --- | --- |
| `web` | nginx serving the built SPA; proxies `/api` to `api` and `/socket.io` to `room` |
| `api` | Fastify + Postgres backend (auth, documents, scenes, files, invites) |
| `room` | Socket.IO relay for live editing and cursors |
| `db` | Postgres 17 |

Only `web` is published (host port `8080` by default). Terminate TLS in front of it (Dokploy/Traefik/Caddy) and point your domain at it. **HTTPS is required** for collaboration because the browser needs `crypto.subtle` (secure context).

## Quick start

```sh
cp .env.example .env
# edit .env: APP_ORIGIN, POSTGRES_PASSWORD, SESSION_SECRET, OWNER_EMAIL, OWNER_PASSWORD

docker compose up -d --build
```

Open `APP_ORIGIN`, sign in with `OWNER_EMAIL` / `OWNER_PASSWORD`.

## Accounts

There is no public signup. The owner is created from `OWNER_EMAIL` / `OWNER_PASSWORD` on API boot. To add someone:

1. Sign in as the owner.
2. Share a board with their email (Share dialog), or use the account-invite endpoint (`POST /api/invites`).
3. They receive a magic link (requires SMTP), or they can sign in with Google/GitHub once invited.

## Data and backups

- Postgres data: `pgdata` volume.
- Uploaded images/thumbnails: `uploads` volume.
- Back up both volumes; scene blobs and images are encrypted with each board's `room_key`, so the database alone is enough to restore content, but the `uploads` volume holds the images.

## Notes

- Legacy upstream share links (`#room=`, `#json=`) still work. Their file/scene endpoints are intentionally unauthenticated for parity; add per-IP quotas if you expose this publicly.
- The room relay is unauthenticated (it forwards opaque encrypted payloads). Persisted data is protected by API authorization; live spoofing by someone holding a board key is possible.
- `.env.development.local` from the Supabase era contains old secrets. Rotate and remove them; they are no longer used by the app.
