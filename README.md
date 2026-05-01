# WoW Simple Achievement App

Self-contained PHP app for fetching World of Warcraft character achievements via the official Battle.net API. Single Docker container, designed to run alongside your other apps on a shared host without interfering with them.

## Architecture

```
Browser
    │
    │ https://your-domain.example/wow-achievements/
    ▼
Host nginx (your existing one)
    │
    │ proxy_pass http://127.0.0.1:8089/   ← strips /wow-achievements/
    ▼
┌─────────────────────────────────────────┐
│  wow-app container (php:8.3-apache)     │
│   ├─ Apache serves static files         │
│   ├─ Apache executes api.php            │
│   └─ SQLite cache in volume             │
└─────────────────────────────────────────┘
                    │
                    ▼
        https://*.api.blizzard.com
```

**One container.** No internal nginx, no FastCGI, no second process. Apache handles HTTP, static files, and PHP all in one image.

## Files

```
wow-app/
├── Dockerfile                  # php:8.3-apache + SQLite
├── docker-compose.yml          # one service, port from .env
├── .env.example                # copy to .env and fill in
├── .gitignore
├── nginx-snippet.conf          # add to your host nginx config
├── src/
│   ├── Cache.php               # SQLite cache class
│   └── BlizzardClient.php      # Battle.net API client
└── public/
    ├── index.html              # frontend (Czech UI)
    └── api.php                 # API endpoint
```

## Safe Deployment (won't touch your other apps)

### 1. Get Battle.net API credentials

1. Go to https://develop.battle.net/ and sign in
2. Click **Create Client**
3. Service URL: leave blank, check "I do not have a service URL"
4. Copy your **Client ID** and **Client Secret**

### 2. Check which ports are free

On your host, see what your other Docker apps use:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
sudo ss -tlnp | grep 127.0.0.1
```

Pick a port not in the list. **8089** is the default in `.env.example` — change it if needed.

### 3. Upload and configure

```bash
# On your host
cd /opt          # or wherever you keep apps
# upload wow-app/ folder here (scp, rsync, or git clone)
cd wow-app
cp .env.example .env
nano .env
# Set BNET_CLIENT_ID, BNET_CLIENT_SECRET, and HOST_PORT if you changed it
```

### 4. Start the container (without touching nginx yet)

```bash
docker compose up -d --build
```

Verify it works in isolation — your other apps are unaffected:

```bash
docker compose ps
# should show wow-app as Up

curl -I http://127.0.0.1:8089/
# should return HTTP/1.1 200 OK

curl -i "http://127.0.0.1:8089/api.php?character=test&realm=test"
# should return JSON (probably 404 from Blizzard, but that proves the endpoint works)
```

If anything fails here, **stop** — fix the container before touching nginx:

```bash
docker compose logs wow-app
```

### 5. Add the nginx location block

Edit your existing nginx site config (in `/etc/nginx/sites-available/`). Inside the `server { }` block that handles your domain's HTTPS, paste the contents of `nginx-snippet.conf`.

**Test the config before reloading:**

```bash
sudo nginx -t
```

If it says `syntax is ok` and `test is successful`, you can safely reload:

```bash
sudo systemctl reload nginx
```

If it errors, your other apps keep running — fix the syntax and re-test before reloading.

### 6. Visit it

Open `https://your-domain.example/wow-achievements/` — you should see the search form.

## Operations

```bash
# View logs
docker compose logs -f wow-app

# Update credentials
nano .env
docker compose up -d                    # picks up new env without rebuild

# Update code
docker compose up -d --build

# Inspect cache
docker compose exec wow-app sh -c 'sqlite3 /var/www/data/cache.sqlite "SELECT key, expires_at FROM cache;"'

# Clear cache
docker compose exec wow-app sh -c 'sqlite3 /var/www/data/cache.sqlite "DELETE FROM cache;"'

# Stop without removing data
docker compose down

# Stop and remove cached data
docker compose down
docker volume rm wow-app_wow-data
```

## Caching behavior

| Key pattern                  | TTL          | Purpose                              |
|------------------------------|--------------|--------------------------------------|
| `oauth_token`                | 23 hours     | Battle.net access token (shared)     |
| `ach:eu:realm:char:cs_CZ`    | `CACHE_TTL`  | Per-character achievement response   |

Frontend shows a `cache: hit` (green) or `cache: live` (blue) badge so you can see when it's serving cached data.

GC runs lazily on ~1% of requests to remove expired entries.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `502 Bad Gateway` on `/wow-achievements/` | Container not running or port mismatch | `docker compose ps`; check HOST_PORT in `.env` matches nginx snippet |
| `Server not configured` JSON | `.env` not loaded | `docker compose up -d` after editing `.env` |
| `Failed to obtain access token` | Wrong credentials | Verify on https://develop.battle.net/ |
| `Character not found` (404) | Wrong realm spelling/region or private profile | Try EU/US toggle, check Armory directly |
| Port already in use | Another app uses your HOST_PORT | Change HOST_PORT in `.env`, update nginx snippet, restart |
| Frontend loads but API returns 404 | Browser cached old paths | Hard refresh (Ctrl+Shift+R) |

## Changing the URL path later

If you want to serve at e.g. `/wow/` instead of `/wow-achievements/`:

1. Update the path in `nginx-snippet.conf` (both the `location` block and the redirect)
2. `sudo nginx -t && sudo systemctl reload nginx`

No container rebuild needed — Apache always serves at root, the prefix is purely an nginx concern.
