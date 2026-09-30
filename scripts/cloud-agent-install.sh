#!/usr/bin/env bash
# Idempotent Cloud Agent install: OS packages, npm deps, local Postgres, schema.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=cloud-agent-lib.sh
source "${ROOT}/scripts/cloud-agent-lib.sh"
cd "${ROOT}"

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y --no-install-recommends postgresql postgresql-contrib poppler-utils

prepare_local_postgres "${ROOT}"

npm ci
npm ci --prefix web
npm ci --prefix autopost

npx playwright install --with-deps chromium
(cd web && npx playwright install chromium)
(cd autopost && npx playwright install chromium)

npm run migrate
(cd autopost && node -e "require('./server/db').initSchema().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); })")

echo "Cloud Agent install complete"
