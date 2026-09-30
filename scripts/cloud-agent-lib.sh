#!/usr/bin/env bash
# Shared helpers for Cloud Agent install/start. Local Postgres only.
set -euo pipefail

start_postgres() {
  if sudo -u postgres pg_isready -q; then
    return 0
  fi
  local version
  version="$(pg_lsclusters --no-header | awk 'NR==1 { print $1 }')"
  if [ -n "${version}" ]; then
    sudo pg_ctlcluster "${version}" main start || true
  fi
  if ! sudo -u postgres pg_isready -q; then
    sudo service postgresql start || true
  fi
  local attempt
  for attempt in $(seq 1 30); do
    if sudo -u postgres pg_isready -q; then
      return 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready" >&2
  return 1
}

ensure_secret_file() {
  local secret_file="${HOME}/.config/so-recruitment/dev.env"
  mkdir -p "$(dirname "${secret_file}")"
  if [ -f "${secret_file}" ]; then
    return 0
  fi
  umask 077
  cat > "${secret_file}" <<EOF
PGPASSWORD=$(openssl rand -hex 24)
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
EOF
}

load_secrets() {
  # shellcheck disable=SC1090
  set -a
  source "${HOME}/.config/so-recruitment/dev.env"
  set +a
}

ensure_role_and_database() {
  load_secrets
  local role_exists db_exists
  role_exists="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='scraper'")"
  if [ "${role_exists}" != "1" ]; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE scraper LOGIN SUPERUSER PASSWORD '${PGPASSWORD}'"
  fi
  db_exists="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='ocr_service'")"
  if [ "${db_exists}" != "1" ]; then
    sudo -u postgres createdb -O scraper ocr_service
  fi
}

write_env_files() {
  local root="$1"
  load_secrets
  if [ ! -f "${root}/.env" ]; then
    cat > "${root}/.env" <<EOF
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=scraper
PGPASSWORD=${PGPASSWORD}
PGDATABASE=ocr_service
DB_SCHEMA=so-candidate-data
AUTOPOST_SCHEMA=so_autopost_apiscraper
APP_ENCRYPTION_KEY=${APP_ENCRYPTION_KEY}
PORT=8080
HEADLESS=true
EOF
  fi
  if [ ! -f "${root}/web/.env.local" ]; then
    cat > "${root}/web/.env.local" <<EOF
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=scraper
PGPASSWORD=${PGPASSWORD}
PGDATABASE=ocr_service
DB_SCHEMA=so-candidate-data
AUTOPOST_SCHEMA=so_autopost_apiscraper
APP_ENCRYPTION_KEY=${APP_ENCRYPTION_KEY}
AUTOPOST_URL=http://127.0.0.1:3100
EOF
  fi
  if [ ! -f "${root}/autopost/.env" ]; then
    cat > "${root}/autopost/.env" <<EOF
PORT=3100
DATABASE_URL=postgresql://scraper:${PGPASSWORD}@127.0.0.1:5432/ocr_service
DB_SCHEMA=so_autopost_apiscraper
SCRAPER_SCHEMA=so-candidate-data
EOF
  fi
}

prepare_local_postgres() {
  local root="$1"
  start_postgres
  if [ ! -f "${root}/.env" ] || [ ! -f "${root}/web/.env.local" ] || [ ! -f "${root}/autopost/.env" ]; then
    ensure_secret_file
    ensure_role_and_database
    write_env_files "${root}"
  else
    start_postgres
  fi
}
