# deploy/ — Case 7: serve a pi harness from a VPS behind nginx

This directory backs Case 7 in the top-level README: **expose the Case 6
triage harness on the public internet, safely, from a small VPS.**

Case 6 gave us a containerized pi harness. Case 7 gives us a URL.

## The stack

```
browser
  │  https + basic auth
  ▼
nginx (:443)          ─── TLS termination, HSTS, basic auth, WS upgrade
  │  http (docker network)
  ▼
ttyd (:7681)          ─── browser-terminal shim
  │  spawns
  ▼
bin/pi-triage         ─── same launcher as Case 6
  │  docker run
  ▼
pi-triage container   ─── --read-only, --network none, non-root
  │
  ▼
pi + triage extension ─── --no-builtin-tools, path-guarded tools
```

Five belts. The two new ones (nginx + ttyd) are what makes this
serveable. The three inner belts are the same ones Case 6 documented.

## Files

- [`compose.yml`](compose.yml) — two services (`ttyd`, `nginx`) on an
  internal `edge` bridge network. Only nginx publishes ports.
- [`nginx/pi-triage.conf`](nginx/pi-triage.conf) — nginx server block:
  :80→:443 redirect with ACME carve-out, TLS, HSTS, basic auth,
  WebSocket upgrade to `ttyd:7681`.
- `nginx/htpasswd` — generated at deploy time (see below). Gitignored.
- `.env` — generated at deploy time (see below). Gitignored.

## First-time VPS setup

Assumes a fresh small Linux VPS with a public IP and a DNS record
`triage.example.com` pointing at it.

```bash
# 1. Prereqs
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin apache2-utils certbot

# 2. Clone the repo
git clone https://…/pi-harness-assembly.git
cd pi-harness-assembly

# 3. Build the Case 6 image on the host (ttyd will call `docker run` on it)
docker build -t pi-triage docker/

# 4. Basic-auth users. -c creates the file; drop -c for subsequent users.
htpasswd -c deploy/nginx/htpasswd alice
htpasswd    deploy/nginx/htpasswd bob

# 5. Env file. Create deploy/.env by hand (this repo will not create it
#    for you — .env is protected). Required contents:
#
#      TTYD_BASIC_AUTH=alice:<same-password-as-above>
#      ANTHROPIC_API_KEY=sk-ant-…
#      # or GOOGLE_API_KEY=…
#
#    TTYD_BASIC_AUTH is ttyd's own defense-in-depth belt, redundant
#    with nginx.

# 6. TLS certificate. Use certbot's webroot mode so renewals work
#    without stopping nginx. First issue is bootstrap-only.
sudo certbot certonly --webroot -w deploy/nginx/webroot \
    -d triage.example.com --email you@example.com --agree-tos -n

# 7. Bring it up
docker compose -f deploy/compose.yml --env-file deploy/.env up -d

# 8. Verify
curl -I https://triage.example.com/          # expect 401 (no auth)
curl -I -u alice:… https://triage.example.com/  # expect 200
```

Browser → `https://triage.example.com` → basic-auth prompt → in-browser
terminal running `bin/pi-triage`. Type `/triage` and go.

## Why ttyd and not "just SSH"

SSH works and is the right answer for one operator. ttyd is the right
answer when:

- **The audience is broader than sysadmins.** An on-call PM can hit a
  URL; they can't `ssh -A` reliably.
- **You want a single choke point for auth and audit.** Basic auth at
  nginx + nginx access logs give you "who ran a triage session, when"
  in one place. SSH keys sprawl.
- **You want the harness to feel like an app.** URL, bookmark, done.

The tradeoff is that ttyd needs the docker socket to spawn Case 6's
`docker run` (see the `-v /var/run/docker.sock` mount in `compose.yml`).
That's a real privilege — the ttyd container can start any container on
the host. Two ways to shrink that:

1. **Bake pi + the extensions into the ttyd container itself** and drop
   the nested `docker run`. You lose the per-session `--read-only`
   isolation but you gain a smaller attack surface at the socket layer.
2. **Use `docker context` with a rootless docker daemon** so socket
   access only grants rootless-scoped container privileges.

For a small internal deployment the socket mount is usually fine; for a
customer-facing URL, do (1) or (2).

## Why nginx and not Caddy / Traefik

Nothing here needs nginx specifically — Caddy would be shorter (auto
TLS built in) and Traefik would be more declarative. Nginx is here
because:

1. It's the config that every VPS operator can read at a glance.
2. WebSocket + basic auth + TLS in ~60 lines is a widely-recognizable
   shape.
3. Swapping in Caddy is ~15 lines and doesn't change the pi story.

The pi story is: **serving a pi harness is a reverse-proxy problem,
not a pi problem.** Once the harness is `docker run`-able (Case 6),
putting a URL in front of it is stock ops.

## What's *not* here

- No orchestration. This is one VPS, one compose file. If you need HA
  or blue/green, that's a real deploy pipeline, not a demo repo.
- No secret manager. Keys live in `deploy/.env` on the host. For a real
  deployment, mount them from your platform's secret store instead.
- No rate limiting. Add `limit_req_zone` in nginx if the endpoint faces
  a hostile internet rather than a trusted team.
- No SSO. Basic auth is deliberate: it's the smallest thing that keeps
  strangers out. Swap in oauth2-proxy in front of nginx when you're
  ready.
