# Self-hosting the cloud workspace

This fork replaces Supabase with a self-contained stack:

| Service | Role |
| --- | --- |
| `web` | nginx serving the built SPA; proxies `/api` to `api` and `/socket.io` to `room` |
| `api` | Fastify + Postgres backend (auth, documents, scenes, files, invites) |
| `room` | Socket.IO relay for live editing and cursors |
| `db` | Postgres 17 |

Only `web` is published (host port `8080` by default). The container serves HTTP on **both 80 and 3000**, so Dokploy/Traefik works whether the domain port is set to 80 or 3000. Terminate TLS in front of it (Dokploy/Traefik/Caddy) and point your domain at it. **HTTPS is required** for collaboration because the browser needs `crypto.subtle` (secure context).

## Images

Deployment uses prebuilt images from GitHub Container Registry; nothing is built on the server.

| Image | Used by |
| --- | --- |
| `ghcr.io/agamya-samuel/excalidraw-web` | `web` |
| `ghcr.io/agamya-samuel/excalidraw-server` | `api` and `room` (same image, different command) |

`.github/workflows/publish-ghcr.yml` builds and pushes both on every push to `feat/cloud-workspace` (or via manual dispatch), tagging:

- `latest`
- `sha-<short>` for immutable deploys

One-time setup after the first run:

1. If the packages are private, either open **GitHub → Packages → package → Settings → Change visibility → Public**, or add GHCR registry credentials to Dokploy.
2. If Actions cannot push, enable **Settings → Actions → General → Workflow permissions → Read and write**.

Pin a version with `IMAGE_TAG` (see `.env.example`):

```env
IMAGE_TAG=latest          # or sha-1a2b3c4
```

## Quick start

```sh
cp .env.example .env
# edit .env: APP_ORIGIN, POSTGRES_PASSWORD, SESSION_SECRET, OWNER_EMAIL, OWNER_PASSWORD

docker compose up -d
```

Open `APP_ORIGIN`, sign in with `OWNER_EMAIL` / `OWNER_PASSWORD`.

To build the images locally instead of pulling them:

```sh
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

## Deploying a change

1. Push to `feat/cloud-workspace`.
2. Wait for **Publish GHCR images** to finish.
3. Redeploy the Compose service in Dokploy. With `IMAGE_TAG=latest`, it pulls the new images; with a SHA tag, bump it first.

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
