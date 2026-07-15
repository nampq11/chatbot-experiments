#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

USE_SUDO=false
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: bash scripts/clean-generated.sh [--sudo] [--dry-run]

Removes generated dependency/build directories from this repository:
  - node_modules
  - node_module
  - dist
  - .next

Options:
  --sudo     Run rm through sudo. The password is never stored in this script.
  --dry-run  Print matching directories without deleting them.
  -h, --help Show this help message.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --sudo)
      USE_SUDO=true
      ;;
    --dry-run)
      DRY_RUN=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

targets=()
while IFS= read -r -d '' target; do
  targets+=("$target")
done < <(
  find . \
    -path ./.git -prune -o \
    -type d \( -name node_modules -o -name node_module -o -name dist -o -name .next \) \
    -prune -print0
)

if [ "${#targets[@]}" -eq 0 ]; then
  echo "No generated directories found."
  exit 0
fi

printf 'Found %d generated directories in %s:\n' "${#targets[@]}" "$REPO_ROOT"
printf '  %s\n' "${targets[@]}"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run only. Nothing deleted."
  exit 0
fi

remove_cmd=(rm -rf)
if [ "$USE_SUDO" = true ]; then
  remove_cmd=(sudo rm -rf)
fi

"${remove_cmd[@]}" -- "${targets[@]}"
echo "Deleted generated directories."
