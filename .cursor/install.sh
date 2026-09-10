#!/usr/bin/env bash
# Cloud Agent install: idempotent dependency + local-DB bootstrap for the
# SO Recruitment stack (scraper control API + Next.js console + autopost server).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== [1/5] System packages (PostgreSQL, poppler-utils) =="
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib poppler-utils
else
  # poppler-utils is used to rasterize PDF attachments; make sure it exists too.
  command -v pdftoppm >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y poppler-utils || true
fi

PGVER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1)"
PGVER="${PGVER:-16}"

echo "== [2/5] Node dependencies (root, web, autopost) =="
npm install
( cd web && npm install )
( cd autopost && npm install )

echo "== [3/5] Playwright Chromium (+OS deps) =="
npx playwright install --with-deps chromium

echo "== [4/5] Local dev .env files (created only if missing) =="
if [ ! -f "$ROOT/.env" ]; then
  cat > "$ROOT/.env" <<'EOF'
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=root
PGPASSWORD=postgres
PGDATABASE=ocr_service
DB_SCHEMA=so-candidate-data
AUTOPOST_SCHEMA=so_autopost_apiscraper
APP_ENCRYPTION_KEY=dev-local-encryption-key-do-not-use-in-prod-0001
POSITION=พนักงานขับรถ
KEYWORD=
MAX_CANDIDATES=15
PROVINCE=
GENDER=
HEADLESS=true
DEBUG=false
REQUEST_DELAY_MIN_MS=2500
REQUEST_DELAY_MAX_MS=6000
PORT=8080
EOF
fi
if [ ! -f "$ROOT/autopost/.env" ]; then
  cat > "$ROOT/autopost/.env" <<'EOF'
PORT=3100
DATABASE_URL=postgresql://root:postgres@127.0.0.1:5432/ocr_service?sslmode=disable
DB_SCHEMA=so_autopost_apiscraper
SCRAPER_SCHEMA=so-candidate-data
EOF
fi
if [ ! -f "$ROOT/web/.env.local" ]; then
  cat > "$ROOT/web/.env.local" <<'EOF'
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-local-nextauth-secret-change-me-0001
AZURE_AD_CLIENT_ID=
AZURE_AD_CLIENT_SECRET=
AZURE_AD_TENANT_ID=
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=root
PGPASSWORD=postgres
PGDATABASE=ocr_service
DB_SCHEMA=so-candidate-data
APP_ENCRYPTION_KEY=dev-local-encryption-key-do-not-use-in-prod-0001
AUTOPOST_URL=http://localhost:3100
EOF
fi

echo "== [5/5] PostgreSQL cluster + database + schema migrations =="
sudo pg_ctlcluster "$PGVER" main start 2>/dev/null || true
# Wait for the server to accept connections.
for i in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then break; fi
  sleep 1
done
# App role + database (idempotent).
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='root'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE root LOGIN SUPERUSER PASSWORD 'postgres';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ocr_service'" | grep -q 1 \
  || sudo -u postgres createdb -O root ocr_service

# Scraper schema (schema.sql … schema-026.sql) + autopost schema.
npm run migrate
( cd autopost && node -e "require('dotenv').config(); const db=require('./server/db'); db.initSchema().then(()=>db.getPool().end()).then(()=>{console.log('autopost schema ready');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})" )

echo "== install complete =="
