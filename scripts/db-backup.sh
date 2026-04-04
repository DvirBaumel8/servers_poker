#!/usr/bin/env bash
set -euo pipefail

# Database backup script using pg_dump.
# Creates timestamped compressed backups and optionally prunes old ones.
#
# Usage:
#   ./scripts/db-backup.sh                   # backup with defaults
#   BACKUP_DIR=/mnt/backups ./scripts/db-backup.sh
#   RETENTION_DAYS=30 ./scripts/db-backup.sh

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-poker}"
DB_USERNAME="${DB_USERNAME:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Starting backup of ${DB_NAME}@${DB_HOST}:${DB_PORT}..."

PGPASSWORD="${DB_PASSWORD:-postgres}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USERNAME}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-acl \
  --format=plain \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[backup] Backup created: ${BACKUP_FILE} (${SIZE})"

if [ "${RETENTION_DAYS}" -gt 0 ]; then
  PRUNED=$(find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +"${RETENTION_DAYS}" -print -delete | wc -l)
  if [ "${PRUNED}" -gt 0 ]; then
    echo "[backup] Pruned ${PRUNED} backups older than ${RETENTION_DAYS} days"
  fi
fi

echo "[backup] Done."
