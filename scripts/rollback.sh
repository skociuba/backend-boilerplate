#!/usr/bin/env bash
set -euo pipefail

# Szybki powrót do WCZEŚNIEJSZEGO, znanego-dobrego obrazu — na wypadek, gdy
# właśnie wypchnięty deploy jest zepsuty.
#
# DZIAŁA, bo .github/workflows/deploy.yaml wypycha na Docker Hub DWA tagi
# na każdy build: :latest ORAZ :<pełny sha commita>. Rollback to po prostu
# "na chwilę powiedz docker-compose, żeby użył starszego sha zamiast
# :latest" — docker-compose.yml czyta tag ze zmiennej IMAGE_TAG
# (${IMAGE_TAG:-latest}), więc nie trzeba niczego edytować w pliku.
#
# Skąd wziąć <sha>: GitHub → zakładka Actions → poprzedni UDANY run →
# krok "Build and push backend image" → w logu widać dokładny tag. Albo:
# `git log --first-parent --oneline master` — każdy commit tam (merge PR-a
# albo bezpośredni push) = jeden deploy = jeden obraz.
#
# Albo po numerze wersji: release.yml dokleja do obrazu z wydania tag :X.Y.Z
# (lista wersji: zakładka Releases na GitHubie albo CHANGELOG.md), np.
# ./scripts/rollback.sh 1.1.0
#
# Użycie: ./scripts/rollback.sh <sha-albo-wersja> [katalog-z-docker-compose.yml]

if [ -z "${1:-}" ]; then
  echo "Użycie: $0 <sha-obrazu-do-przywrócenia> [katalog]" >&2
  echo "Sha znajdziesz w GitHub Actions (poprzedni udany run) albo w 'git log'." >&2
  exit 1
fi

SHA="$1"
TARGET_DIR="${2:-$(dirname "$0")/..}"
IMAGE="sebastiankociuba/node-backend:${SHA}"

echo "=== Rollback do obrazu: ${IMAGE} ==="

# Backup PRZED rollbackiem — rollback KODU nie odwraca migracji, które już
# się wykonały na żywej bazie. Jeśli zepsuty deploy zawierał DESTRUKTYWNĄ
# migrację (np. DROP COLUMN), sam powrót starego kodu tego nie naprawi —
# wtedy potrzebny jest backup wzięty PRZED tamtym deployem (plik w
# backups/, nazwa = data+godzina), nie ten z teraz. Ten backup "teraz" to
# tylko dodatkowa siatka bezpieczeństwa na wszelki wypadek.
"$TARGET_DIR/scripts/backup-db.sh" "$TARGET_DIR"

cd "$TARGET_DIR"

# Compose v2 (`docker compose`) jeśli jest, inaczej v1 (`docker-compose`,
# tak jak teraz na VPS) — ten sam wybór co w deployu frontendu.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

IMAGE_TAG="$SHA" $DC pull app

# Najpierw usuń SAM kontener aplikacji, potem postaw nowy. docker-compose
# v1 przy podmianie istniejącego kontenera (`up -d app` na działającym)
# wywala się na nowszym Dockerze z "KeyError: 'ContainerConfig'". Na świeżo,
# bez starego kontenera, ten błąd nie występuje. --no-deps: baza (db) nie
# jest ruszana, rollback dotyczy tylko kodu.
$DC rm --stop --force app
IMAGE_TAG="$SHA" $DC up -d --no-deps app

# Ten sam warunek "gotowe" co w deployu: aplikacja odpowiada razem z bazą
"$TARGET_DIR/scripts/wait-healthy.sh" "$TARGET_DIR"

echo "=== Gotowe. ==="
echo "Obraz działa teraz na ${IMAGE} — NIE na :latest. Następny normalny"
echo "deploy (merge do master) wróci do :latest automatycznie."
