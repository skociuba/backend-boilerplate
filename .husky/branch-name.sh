# Wspólna reguła nazw branchy dla pre-commit i pre-push (source, nie exec).
# Użycie: check_branch_name <nazwa> → exit 1 z komunikatem, jeśli zła.

# Ta sama reguła co w .claude/hooks/naming-guard.py (konwencja z repo firmowego):
# <typ>/<opis>, <typ>-<nr>/<opis> albo <typ>/<nr>/<opis>.
BRANCH_PATTERN='^(feat|fix|chore|refactor|ci|docs|test|perf|style|build|revert|hotfix)([-/][0-9]+(-[0-9]+)*)?/[A-Za-z0-9][A-Za-z0-9._-]*$'
# deploy: push na niego = deploy na VPS (patrz .github/workflows/deploy.yaml).
# prisma-experiment, lern-BE: stare branche sprzed konwencji — usunąć z listy, gdy znikną.
BRANCH_EXCEPTIONS="deploy prisma-experiment lern-BE"

check_branch_name() {
  for ok in $BRANCH_EXCEPTIONS; do
    [ "$1" = "$ok" ] && return 0
  done
  if ! echo "$1" | grep -Eq "$BRANCH_PATTERN"; then
    echo "✖ Zła nazwa brancha: '$1'"
    echo "  Wymagany format: <typ>/<opis>, <typ>-<nr>/<opis> lub <typ>/<nr>/<opis>"
    echo "  np. feat/children-crud, feat-26998/history-krakow, fix/26859/login-cookie"
    echo "  Typy: feat fix chore refactor ci docs test perf style build revert hotfix"
    echo "  Zmiana nazwy: git branch -m <nowa-nazwa>"
    return 1
  fi
}
