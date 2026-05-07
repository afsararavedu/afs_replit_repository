#!/usr/bin/env bash
# Build a complete production release of BRR Liquor Soft (api-server + brr-web).
#
# Output layout (under ./release/):
#   release/
#     api/                # node bundle to run with `node dist/index.mjs`
#       dist/             # esbuild output for the api-server
#       package.json      # pnpm install --prod here on the EC2 box
#       pnpm-lock.yaml
#       node_modules/     # populated only if BUILD_RELEASE_INSTALL_API_DEPS=1
#     web/                # static site to serve from nginx (root = release/web)
#     VERSION             # short git SHA + UTC timestamp
#
# Re-running this script is safe: ./release is wiped and rebuilt each time.
#
# Usage:
#   bash scripts/deploy/build-release.sh
#
# Optional env:
#   BUILD_RELEASE_INSTALL_API_DEPS=1   # also install api-server runtime deps
#                                      # into release/api/node_modules. Off by
#                                      # default because pnpm cannot install
#                                      # workspace:* deps outside the monorepo;
#                                      # the runbook installs deps on the EC2
#                                      # box from a checkout of the repo.

set -euo pipefail

# Resolve repo root from this script's location so the script works regardless
# of where it's invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

RELEASE_DIR="$REPO_ROOT/release"

log() { printf '\033[1;34m[build-release]\033[0m %s\n' "$*"; }

if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm is not installed or not on PATH" >&2
  echo "  install with: corepack enable && corepack prepare pnpm@latest --activate" >&2
  exit 1
fi

log "wiping previous release/ directory"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR/api" "$RELEASE_DIR/web"

log "step 1/5: pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

log "step 2/5: regenerate API client + zod schemas from OpenAPI spec"
pnpm --filter @workspace/api-spec run codegen

log "step 3/5: build api-server (esbuild)"
pnpm --filter @workspace/api-server run build

log "step 4/5: build web frontend (vite)"
# vite.config.ts requires PORT and BASE_PATH to be set even at build time.
# PORT is irrelevant for static output (only used by the dev/preview server),
# so any value is fine. BASE_PATH controls where assets are served from in
# production -- "/" means the site is served at the domain root.
PORT=80 BASE_PATH=/ pnpm --filter @workspace/brr-web run build

log "step 5/5: assemble release/ folder"

# api-server: copy the bundled output and the runtime manifest. We
# intentionally do NOT copy node_modules here -- on EC2 you'll check the
# repo out and run `pnpm install --prod --filter @workspace/api-server`,
# because the api-server depends on workspace:* packages that pnpm can
# only resolve from inside the monorepo.
cp -R artifacts/api-server/dist "$RELEASE_DIR/api/dist"
cp artifacts/api-server/package.json "$RELEASE_DIR/api/package.json"
cp pnpm-lock.yaml "$RELEASE_DIR/api/pnpm-lock.yaml" 2>/dev/null || true

if [[ "${BUILD_RELEASE_INSTALL_API_DEPS:-0}" == "1" ]]; then
  log "  installing api-server runtime deps into release/api (best-effort)"
  # This is best-effort and only useful if you've vendored / replaced the
  # workspace:* deps with real versions. It will fail on a stock checkout.
  (cd "$RELEASE_DIR/api" && pnpm install --prod) || \
    log "  warning: pnpm install in release/api failed (expected if workspace:* deps are present)"
fi

# web: vite outputs to artifacts/brr-web/dist/public
cp -R artifacts/brr-web/dist/public/. "$RELEASE_DIR/web/"

# Stamp the release with a VERSION marker so you can tell what's deployed.
{
  echo "git_sha=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$RELEASE_DIR/VERSION"

log "done."
log "release/ contents:"
( cd "$RELEASE_DIR" && find . -maxdepth 2 -mindepth 1 | sort )
