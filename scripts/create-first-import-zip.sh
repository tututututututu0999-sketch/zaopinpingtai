#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
archive_path="${1:-$project_root/first-visual-suite-import.zip}"

cd "$project_root"
zip -rq -FS "$archive_path" "数学思维冲顶计划" "语数英重难点突破" -x "*/.DS_Store"
printf 'Created %s\n' "$archive_path"
