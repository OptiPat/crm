#!/usr/bin/env bash
# Sauvegarde quotidienne du portail espace client (VPS Linux).
# Usage : sudo bash backup-portail.sh
# Cron suggere : 0 3 * * * root /opt/espace-portail/deploy/backup-portail.sh

set -euo pipefail

INSTALL_ROOT="${ESPACE_INSTALL_ROOT:-/opt/espace-portail}"
DATA_DIR="${ESPACE_PORTAL_DATA:-$INSTALL_ROOT/data}"
DB_PATH="${ESPACE_PORTAL_DB:-$DATA_DIR/espace-portail.db}"
UPLOADS_DIR="${ESPACE_PORTAL_UPLOADS:-$DATA_DIR/uploads}"
BACKUP_DIR="${ESPACE_BACKUP_DIR:-$INSTALL_ROOT/backups}"
RETENTION_DAYS="${ESPACE_BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "Base introuvable : $DB_PATH" >&2
  exit 1
fi

DB_BACKUP="$BACKUP_DIR/espace-portail-$STAMP.db"
sqlite3 "$DB_PATH" ".backup '$DB_BACKUP'"
sqlite3 "$DB_BACKUP" "PRAGMA integrity_check;" | grep -qx ok

if [[ -d "$UPLOADS_DIR" ]] && [[ -n "$(ls -A "$UPLOADS_DIR" 2>/dev/null || true)" ]]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$DATA_DIR" uploads
fi

find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -delete

echo "Sauvegarde OK : $DB_BACKUP"
ls -lh "$BACKUP_DIR" | tail -5
