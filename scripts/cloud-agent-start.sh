#!/usr/bin/env bash
# Per-boot: local Postgres must be running. Dependency install stays in install.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=cloud-agent-lib.sh
source "${ROOT}/scripts/cloud-agent-lib.sh"

prepare_local_postgres "${ROOT}"
echo "PostgreSQL is ready"
