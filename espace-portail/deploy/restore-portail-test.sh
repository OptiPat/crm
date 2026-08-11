#!/usr/bin/env bash
# Test de restauration — ne remplace PAS la production.
# Usage : sudo bash restore-portail-test.sh [/chemin/vers/backup.db]
#
# Vérifie l'intégrité SQLite et affiche quelques compteurs.
# À lancer mensuellement après backup-portail.sh.

set -euo pipefail

INSTALL_ROOT="${ESPACE_INSTALL_ROOT:-/opt/espace-portail}"
BACKUP_DIR="${ESPACE_BACKUP_DIR:-$INSTALL_ROOT/backups}"

if [[ $# -ge 1 ]]; then
  SOURCE="$1"
else
  SOURCE="$(ls -1t "$BACKUP_DIR"/espace-portail-*.db 2>/dev/null | head -1 || true)"
fi

if [[ -z "${SOURCE:-}" ]] || [[ ! -f "$SOURCE" ]]; then
  echo "Aucune sauvegarde trouvée dans $BACKUP_DIR" >&2
  exit 1
fi

WORK="/tmp/espace-restore-test-$$.db"
trap 'rm -f "$WORK"' EXIT

cp "$SOURCE" "$WORK"
chmod 600 "$WORK"

echo ">> Intégrité SQLite"
sqlite3 "$WORK" "PRAGMA integrity_check;" | grep -qx ok

echo ">> Compteurs"
sqlite3 "$WORK" <<'SQL'
SELECT 'contacts_actifs', COUNT(*) FROM espace_acces WHERE statut = 'actif';
SELECT 'sessions', COUNT(*) FROM espace_session;
SELECT 'journal_connexions', COUNT(*) FROM espace_connexion_log;
SELECT 'depots_en_attente', COUNT(*) FROM espace_depot;
SQL

echo ">> Restauration test OK depuis : $SOURCE"
echo "Pour une vraie restauration : arrêter espace-portail, remplacer la base, redémarrer, puis rotation secrets si doute."
