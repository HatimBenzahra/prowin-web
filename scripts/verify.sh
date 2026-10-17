#!/usr/bin/env bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════
#  verify.sh — barrière de qualité prowin-web (backend + frontend)
#
#  Source unique de ce qui est « vert » : lancée par ./deploy avant tout
#  envoi au serveur ET par la CI GitHub. Un échec bloque le déploiement.
#
#  Usage :
#    npm run verify            (depuis prowin-web/)
#
#  Prérequis : dépendances installées (npm ci) et Docker démarré, pour les
#  tests d'intégration du backend (base Postgres jetable). En CI, la base est
#  fournie par un service : TEST_DATABASE_URL la désigne et Docker n'est pas utilisé.
# ════════════════════════════════════════════════════════════════════════

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'

FAILED=()

# Lance une étape et la consigne en échec sans interrompre les suivantes :
# on veut le tableau complet de ce qui casse, pas seulement la première erreur.
step() {
    local label="$1"; shift
    echo ""
    echo "${CYAN}${BOLD}▶ ${label}${NC}"
    if "$@"; then
        echo "${GREEN}✓ ${label}${NC}"
    else
        echo "${RED}✗ ${label}${NC}"
        FAILED+=("$label")
    fi
}

in_dir() {
    local dir="$1"; shift
    (cd "${ROOT}/${dir}" && "$@")
}

# ── Backend ──────────────────────────────────────────────────────────────
step "backend · typecheck"           in_dir backend npx tsc --noEmit -p tsconfig.json
step "backend · lint (cliquet)"      in_dir backend npm run --silent lint:ratchet
step "backend · tests unitaires"     in_dir backend npx jest --ci
step "backend · tests d'intégration" in_dir backend npm run --silent test:int

# ── Frontend ─────────────────────────────────────────────────────────────
step "frontend · lint (erreurs)"     in_dir frontend npx eslint . --quiet
step "frontend · tests unitaires"    in_dir frontend npx vitest run
step "frontend · build"              in_dir frontend npx vite build --logLevel warn

echo ""
if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo "${RED}${BOLD}✗ Barrière prowin-web : ${#FAILED[@]} étape(s) en échec${NC}"
    for label in "${FAILED[@]}"; do echo "  ${RED}- ${label}${NC}"; done
    exit 1
fi
echo "${GREEN}${BOLD}✓ Barrière prowin-web : tout est vert${NC}"
