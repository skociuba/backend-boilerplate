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
# `git log --oneline` na branchu `deploy` — każdy commit tam = jeden obraz.
#
# Użycie: ./scripts/rollback.sh <sha> [katalog-z-docker-compose.yml]

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
IMAGE_TAG="$SHA" docker-compose pull app
IMAGE_TAG="$SHA" docker-compose up -d app

echo "=== Gotowe. Sprawdź: docker-compose ps / docker logs <kontener> ==="
echo "Obraz działa teraz na ${IMAGE} — NIE na :latest. Następny normalny"
echo "deploy (push na branch 'deploy') wróci do :latest automatycznie."
