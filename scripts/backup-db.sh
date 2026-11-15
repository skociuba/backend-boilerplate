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

# NIE `source` — .env to format docker compose (KEY=VALUE), nie skrypt bashowy.
# Wartość typu `EMAIL_FROM=Aplikacja <no-reply@x.pl>` jest dla compose zwykłym
# stringiem, a dla basha przekierowaniem `<`/`>` i syntax errorem, który
# wywalał cały deploy. Czytamy więc tylko dwa klucze, których potrzebujemy.
read_env() {
  local value
  value=$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r')
  # Zdejmij ewentualne otaczające cudzysłowy, tak jak robi to compose.
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}
POSTGRES_USER=$(read_env POSTGRES_USER)
POSTGRES_DB=$(read_env POSTGRES_DB)
if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
  echo "Brak POSTGRES_USER lub POSTGRES_DB w $ENV_FILE." >&2
  exit 1
fi

# Po etykietach, nie po nazwie: Compose v2 nazywa kontener <projekt>-db-1,
# a v1 (deploy woła `docker-compose`) <projekt>_db_1, więc filtr po nazwie
# trafiał tylko w jedną wersję. working_dir zawęża do TEGO projektu — na VPS
# stoją też inne compose'y i mogą mieć własny serwis `db`.
PROJECT_DIR=$(cd "$TARGET_DIR" && pwd)
CONTAINER=$(docker ps \
  --filter "label=com.docker.compose.service=db" \
  --filter "label=com.docker.compose.project.working_dir=$PROJECT_DIR" \
  --format "{{.Names}}" | head -1)
# Bardzo stary docker-compose v1 (sprzed 1.25) nie ustawia working_dir.
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "^$(basename "$PROJECT_DIR" | tr -cd 'a-zA-Z0-9-')[-_]db[-_]1$" | head -1 || true)
fi
if [ -z "$CONTAINER" ]; then
  echo "Nie znalazłem działającego kontenera bazy (serwis db w $PROJECT_DIR)." >&2
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
