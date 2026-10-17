#!/usr/bin/env bash
# Tests d'intégration backend sur une VRAIE base Postgres jetable.
#
# Local : démarre docker-compose.test.yml (Postgres 16, port 55432, tmpfs), applique
# les migrations, lance `test/jest-int.json`, puis détruit la base dans tous les cas.
# CI : si TEST_DATABASE_URL est défini (service container), on l'utilise tel quel,
# sans docker compose.
#
# Les arguments sont transmis à jest (ex. `npm run test:int -- -t "stats"`).
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE=docker-compose.test.yml
LOCAL_DB_URL=postgresql://prowin_test:prowin_test@localhost:55432/prowin_test

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  echo "▶ Base de test fournie (TEST_DATABASE_URL) : pas de docker compose."
  DB_URL="$TEST_DATABASE_URL"
else
  cleanup() {
    echo "▶ Arrêt et suppression de la base de test…"
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  trap 'exit 130' INT TERM

  # Une base résiduelle (run interrompu) repartirait d'un état sale.
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
  echo "▶ Démarrage de la base de test (port 55432)…"
  docker compose -f "$COMPOSE_FILE" up -d --wait --wait-timeout 90
  DB_URL="$LOCAL_DB_URL"
fi

# DATABASE_URL : utilisé par la CLI Prisma (migrations).
# TEST_DATABASE_URL / COACHING_TEST_DATABASE_URL : lus explicitement par les suites,
# qui refusent de tourner sans (jamais de repli sur le .env de dev).
export DATABASE_URL="$DB_URL"
export TEST_DATABASE_URL="$DB_URL"
export COACHING_TEST_DATABASE_URL="$DB_URL"

echo "▶ Application des migrations…"
npx prisma migrate deploy

echo "▶ Tests d'intégration…"
npx jest --config test/jest-int.json --runInBand "$@"
