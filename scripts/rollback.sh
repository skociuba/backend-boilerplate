#!/usr/bin/env bash
set -euo pipefail

# Szybki powrót do WCZEŚNIEJSZEGO, znanego-dobrego obrazu — na wypadek, gdy
# właśnie wypchnięty deploy jest zepsuty.
#
# Normalnie rollback robi się z GitHuba: Actions → "Deploy Backend" →
# Run workflow → numer starszej wersji (deploy.yml). Ten skrypt jest na
# sytuację, gdy GitHub Actions nie działa albo trzeba wrócić do obrazu,
# który nie jest wydaniem.
#
# Każde wydanie ma na Docker Hubie obraz :X.Y.Z (release.yml), a każdy
# commit na master obraz :<pełny sha> (ci.yml). docker-compose.yml czyta
# tag ze zmiennej IMAGE_TAG (${IMAGE_TAG:-latest}), więc nie trzeba
# niczego edytować w pliku.
#
# Lista wersji: zakładka Releases na GitHubie albo CHANGELOG.md, np.
# ./scripts/rollback.sh 1.1.0
# Sha: `git log --first-parent --oneline master`.
#
# Użycie: ./scripts/rollback.sh <sha-albo-wersja> [katalog-z-docker-compose.yml]

if [ -z "${1:-}" ]; then
  echo "Użycie: $0 <wersja-albo-sha> [katalog]" >&2
  echo "Wersje: zakładka Releases albo CHANGELOG.md; sha: 'git log'." >&2
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
echo "Obraz działa teraz na ${IMAGE}. Następne wydanie (merge release"
echo "PR-a) wdroży nową wersję automatycznie."
