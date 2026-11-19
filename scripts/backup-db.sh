#!/usr/bin/env bash
set -euo pipefail

# Backup bazy i wgranych plików PRZED każdym deployem (patrz
# .github/workflows/deploy.yml) — jeśli migracja coś popsuje, masz czym to
# odkręcić. Uruchamiany też codziennie z crona (/etc/cron.d/vps2-backup),
# na wypadek wszystkiego innego (błąd w aplikacji, rekord usunięty przez
# pomyłkę) — niezależnie od tego, czy akurat był deploy.
#
# Co powstaje:
#   backups/backup_<czas>.sql.gz    — pg_dump bazy (wewnątrz kontenera db,
#                                     host nie potrzebuje narzędzi Postgresa)
#   backups/uploads_<czas>.tar.gz   — avatary, dokumenty i zdjęcia postów
#                                     (wolumen uploads-data, przez kontener app)
#
# Kopia poza serwerem: jeśli istnieje /etc/vps2-backup/backup.conf, oba
# pliki są szyfrowane (age, kluczem PUBLICZNYM) i wysyłane rclone'em do
# Backblaze B2. Kopia na tym samym dysku co baza nie chroni przed utratą
# całego serwera. Klucza prywatnego na serwerze nie ma — ktoś, kto przejmie
# serwer, nie odczyta starych kopii. Czy da się z nich odtworzyć bazę,
# sprawdza co tydzień .github/workflows/backup-restore-test.yml.
#
# /etc/vps2-backup/backup.conf (KEY=VALUE, root, chmod 600):
#   BACKUP_REMOTE=b2:<nazwa-bucketa>
#   BACKUP_AGE_RECIPIENT=age1...
# /etc/vps2-backup/rclone.conf — dane dostępowe do B2 (klucz tylko do zapisu)
#
# Użycie: ./scripts/backup-db.sh [katalog-z-docker-compose.yml]
# Czyta POSTGRES_USER/POSTGRES_DB z .env w tym katalogu (ten sam plik, z
# którego docker-compose.yml i tak podstawia te wartości).

TARGET_DIR="${1:-$(dirname "$0")/..}"
ENV_FILE="$TARGET_DIR/.env"
BACKUP_DIR="$TARGET_DIR/backups"
RETENTION_DAYS=14
# Nadpisywalne tylko po to, żeby dało się przetestować wysyłkę bez /etc
OFFSITE_DIR="${BACKUP_OFFSITE_DIR:-/etc/vps2-backup}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Nie znaleziono $ENV_FILE — nie wiem, jakiej bazy/usera użyć." >&2
  exit 1
fi

# NIE `source` — .env to format docker compose (KEY=VALUE), nie skrypt bashowy.
# Wartość typu `EMAIL_FROM=Aplikacja <no-reply@x.pl>` jest dla compose zwykłym
# stringiem, a dla basha przekierowaniem `<`/`>` i syntax errorem, który
# wywalał cały deploy. Czytamy więc tylko klucze, których potrzebujemy.
read_kv() {
  local file="$1" key="$2" value
  value=$(grep -E "^[[:space:]]*$key=" "$file" | tail -1 | cut -d= -f2- | tr -d '\r' || true)
  # Zdejmij ewentualne otaczające cudzysłowy, tak jak robi to compose.
  value="${value%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"
  printf '%s' "$value"
}
POSTGRES_USER=$(read_kv "$ENV_FILE" POSTGRES_USER)
POSTGRES_DB=$(read_kv "$ENV_FILE" POSTGRES_DB)
if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
  echo "Brak POSTGRES_USER lub POSTGRES_DB w $ENV_FILE." >&2
  exit 1
fi

# Po etykietach, nie po nazwie: Compose v2 nazywa kontener <projekt>-db-1,
# a v1 (deploy woła `docker-compose`) <projekt>_db_1, więc filtr po nazwie
# trafiał tylko w jedną wersję. working_dir zawęża do TEGO projektu — na VPS
# stoją też inne compose'y i mogą mieć własny serwis `db`.
PROJECT_DIR=$(cd "$TARGET_DIR" && pwd)
find_container() {
  local service="$1" name
  name=$(docker ps \
    --filter "label=com.docker.compose.service=$service" \
    --filter "label=com.docker.compose.project.working_dir=$PROJECT_DIR" \
    --format "{{.Names}}" | head -1)
  # Bardzo stary docker-compose v1 (sprzed 1.25) nie ustawia working_dir.
  if [ -z "$name" ]; then
    name=$(docker ps --format "{{.Names}}" | grep -E "^$(basename "$PROJECT_DIR" | tr -cd 'a-zA-Z0-9-')[-_]${service}[-_]1$" | head -1 || true)
  fi
  printf '%s' "$name"
}

DB_CONTAINER=$(find_container db)
if [ -z "$DB_CONTAINER" ]; then
  echo "Nie znalazłem działającego kontenera bazy (serwis db w $PROJECT_DIR)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"

# Zapis do .part i dopiero potem mv: gdy pg_dump padnie w połowie,
# pipefail przerywa skrypt, a ucięty plik nie udaje gotowej kopii
# (wcześniej zostawał backup_*.sql.gz, który wyglądał na poprawny).
trap 'rm -f "$BACKUP_DIR"/*.part "$BACKUP_DIR"/*.age' EXIT

# --no-owner --no-acl: dump bez "OWNER TO <user>" i GRANT-ów, więc da się
# go odtworzyć na bazie z innym użytkownikiem (test odtwarzania w CI,
# nowy serwer) — tabele dostaje ten, kto odtwarza
docker exec "$DB_CONTAINER" pg_dump --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$DB_FILE.part"
mv "$DB_FILE.part" "$DB_FILE"
echo "Backup bazy: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# Pliki z wolumenu uploads-data — przez kontener app, bo to on ma wolumen
# zamontowany (tar jest w obrazie alpine). Bez działającej aplikacji
# (np. cron akurat w trakcie deployu) pomijamy, baza jest ważniejsza.
FILES_TO_SEND=("$DB_FILE")
APP_CONTAINER=$(find_container app)
if [ -n "$APP_CONTAINER" ]; then
  docker exec "$APP_CONTAINER" tar czf - -C /usr/src/app/uploads . > "$UPLOADS_FILE.part"
  mv "$UPLOADS_FILE.part" "$UPLOADS_FILE"
  FILES_TO_SEND+=("$UPLOADS_FILE")
  echo "Backup plików: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
else
  echo "UWAGA: kontener app nie działa — pomijam backup plików (uploads)." >&2
fi

# Rotacja — bez tego backups/ rosłoby w nieskończoność i kiedyś zapełniło
# dysk. W B2 starsze kopie kasuje reguła cyklu życia bucketa (lifecycle).
find "$BACKUP_DIR" \( -name "backup_*.sql.gz" -o -name "uploads_*.tar.gz" \) \
  -mtime "+${RETENTION_DAYS}" -delete

if [ ! -f "$OFFSITE_DIR/backup.conf" ]; then
  echo "UWAGA: brak $OFFSITE_DIR/backup.conf — kopia zostaje tylko na tym serwerze." >&2
  exit 0
fi

BACKUP_REMOTE=$(read_kv "$OFFSITE_DIR/backup.conf" BACKUP_REMOTE)
BACKUP_AGE_RECIPIENT=$(read_kv "$OFFSITE_DIR/backup.conf" BACKUP_AGE_RECIPIENT)
export RCLONE_CONFIG="$OFFSITE_DIR/rclone.conf"

# Błąd wysyłki NIE przerywa skryptu (a więc i deployu): lokalna kopia już
# jest, a awaria B2 nie powinna blokować wdrożeń. Brak świeżej kopii w B2
# i tak wyjdzie w cotygodniowym teście odtwarzania (sprawdza jej wiek).
# --no-check-dest: klucz serwera ma tylko prawo zapisu, nie listowania —
# nazwy z datą i tak się nie powtarzają.
for file in "${FILES_TO_SEND[@]}"; do
  case "$(basename "$file")" in
    backup_*) folder=db ;;
    *) folder=uploads ;;
  esac
  if age -r "$BACKUP_AGE_RECIPIENT" -o "$file.age" "$file" \
    && rclone copyto --no-check-dest "$file.age" "$BACKUP_REMOTE/$folder/$(basename "$file").age"; then
    echo "Wysłane poza serwer: $BACKUP_REMOTE/$folder/$(basename "$file").age"
  else
    echo "BŁĄD: nie udało się wysłać $file do $BACKUP_REMOTE — kopia jest tylko lokalnie." >&2
  fi
  rm -f "$file.age"
done

# Przywracanie (ręcznie, w razie potrzeby — NIE część tego skryptu, to
# zbyt poważna operacja, żeby działa się bez zastanowienia):
#   gunzip -c backups/backup_XXXXXXXX_XXXXXX.sql.gz | docker exec -i <kontener-db> psql -U "$POSTGRES_USER" "$POSTGRES_DB"
#   docker exec -i <kontener-app> tar xzf - -C /usr/src/app/uploads < backups/uploads_XXXXXXXX_XXXXXX.tar.gz
# Z kopii w B2 (plik .age): age -d -i <klucz-prywatny> plik.age > plik
