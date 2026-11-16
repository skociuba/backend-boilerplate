#!/usr/bin/env bash
set -euo pipefail

# Czeka, aż kontener aplikacji zgłosi status "healthy" (HEALTHCHECK w
# Dockerfile.prod pyta GET /health, czyli aplikację RAZEM z bazą).
# Bez tego deploy kończył się na zielono zaraz po `up -d`, nawet jeśli
# aplikacja padła sekundę później (zły .env, brak bazy, błąd przy starcie).
# Teraz job jest czerwony, a w logu CI od razu widać ostatnie linie logów.
#
# Używany przez .github/workflows/deploy.yaml i scripts/rollback.sh.
# Użycie: ./scripts/wait-healthy.sh [katalog-z-docker-compose.yml]

TARGET_DIR="${1:-$(dirname "$0")/..}"
SERVICE="app"
ATTEMPTS=30   # 30 × 5 s = 2,5 minuty — z zapasem na start-period i retries
INTERVAL=5

# Kontener po etykietach, jak w backup-db.sh: Compose v1 nazywa go
# <projekt>_app_1, v2 <projekt>-app-1, więc nazwa nie jest pewna.
PROJECT_DIR=$(cd "$TARGET_DIR" && pwd)
CONTAINER=$(docker ps -a \
  --filter "label=com.docker.compose.service=$SERVICE" \
  --filter "label=com.docker.compose.project.working_dir=$PROJECT_DIR" \
  --format "{{.Names}}" | head -1)
if [ -z "$CONTAINER" ]; then
  echo "Nie znalazłem kontenera serwisu $SERVICE w $PROJECT_DIR." >&2
  exit 1
fi

status="unknown"
for i in $(seq 1 "$ATTEMPTS"); do
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$CONTAINER" 2>/dev/null || echo "missing")
  case "$status" in
    healthy)
      echo "$CONTAINER: healthy (po ~$(( (i - 1) * INTERVAL )) s)"
      exit 0
      ;;
    no-healthcheck)
      # Obrazy zbudowane przed dodaniem HEALTHCHECK-a (rollback do starszej
      # wersji) nie mają statusu zdrowia. Bez tego wyjątku każdy taki
      # rollback kończyłby się błędem, choć aplikacja działa — sprawdzamy
      # więc chociaż, czy kontener działa i nie restartuje się w kółko.
      sleep 15
      if [ "$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' "$CONTAINER")" = "true 0" ]; then
        echo "UWAGA: obraz bez HEALTHCHECK — sprawdzone tylko, że $CONTAINER działa od 15 s bez restartów."
        exit 0
      fi
      break
      ;;
    unhealthy|missing)
      # Zniknięty albo już niezdrowy kontener — dalsze czekanie nic nie da
      break
      ;;
  esac
  sleep "$INTERVAL"
done

echo "$CONTAINER nie osiągnął stanu healthy (status: $status). Ostatnie logi:" >&2
docker logs --tail 50 "$CONTAINER" >&2 || true
exit 1
