#!/usr/bin/env bash
# Cloud Agent start: bring up the local PostgreSQL server each boot.
# App servers run as named terminals (see environment.json), not here.
set -euo pipefail

PGVER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -1)"
PGVER="${PGVER:-16}"

sudo pg_ctlcluster "$PGVER" main start 2>/dev/null || true
for i in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    echo "PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done
echo "WARNING: PostgreSQL did not become ready in time." >&2
exit 0
