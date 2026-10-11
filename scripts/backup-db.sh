#!/usr/bin/env bash
set -euo pipefail

# Backup bazy PRZED każdym deployem (patrz .github/workflows/deploy.yaml) —
# jeśli migracja coś popsuje, masz czym to odkręcić. Uruchamiany też osobno,
# z crona, na wypadek wszystkiego innego (błąd w aplikacji, wycięty rekord
# przez pomyłkę) — niezależnie od tego, czy akurat był deploy.
#
# pg_dump wykonany WEWNĄTRZ kontenera `db` (docker exec), wynik przekierowany
# na hosta i spakowany — to kontener ma zainstalowane narzędzia Postgresa,
# host nie musi.
#
# CZEGO TEN SKRYPT NIE ROBI: nie wysyła kopii POZA tę maszynę. Plik .sql.gz
# leżący na tym samym dysku co baza chroni przed błędem w danych/migracji,
# ale NIE przed utratą całego serwera. Dopisz na końcu tego skryptu jedną
# linię (scp/rsync/rclone do innego miejsca), kiedy będziesz mieć dokąd.
#
# Użycie: ./scripts/backup-db.sh [katalog-z-docker-compose.yml]
# Czyta POSTGRES_USER/POSTGRES_DB z .env w tym katalogu (ten sam plik, z
# którego docker-compose.yml i tak podstawia te wartości).

TARGET_DIR="${1:-$(dirname "$0")/..}"
ENV_FILE="$TARGET_DIR/.env"
BACKUP_DIR="$TARGET_DIR/backups"
RETENTION_DAYS=14

if [ ! -f "$ENV_FILE" ]; then
  echo "Nie znaleziono $ENV_FILE — nie wiem, jakiej bazy/usera użyć." >&2
  exit 1
fi

# set -a eksportuje KAŻDĄ zmienną zdefiniowaną przy source'owaniu .env, nie
# tylko te, które sami wymienimy — prościej niż ręczne `export` per linia.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

CONTAINER=$(docker ps --filter "name=-db-1" --format "{{.Names}}" | head -1)
if [ -z "$CONTAINER" ]; then
  echo "Nie znalazłem działającego kontenera bazy (filtr: *-db-1)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT_FILE"

# Rotacja — bez tego backups/ rosłoby w nieskończoność i kiedyś zapełniło dysk.
find "$BACKUP_DIR" -name "backup_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "Backup zapisany: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Przywracanie (ręcznie, w razie potrzeby — NIE część tego skryptu, to
# zbyt poważna operacja, żeby działa się bez zastanowienia):
#   gunzip -c backups/backup_XXXXXXXX_XXXXXX.sql.gz | docker exec -i <kontener-db> psql -U "$POSTGRES_USER" "$POSTGRES_DB"
