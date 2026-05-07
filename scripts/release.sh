#!/usr/bin/env bash
# Usage: scripts/release.sh <action> <version>
# Example: scripts/release.sh preview 0.1.0
set -euo pipefail

action="${1:?action required}"
version="${2:?version required}"
tag="${action}/v${version}"
major="$(cut -d. -f1 <<<"$version")"
floating="${action}/v${major}"

[[ -d "$action" ]] || { echo "no such action: $action" >&2; exit 1; }
[[ -f "$action/CHANGELOG.md" ]] || { echo "missing CHANGELOG.md" >&2; exit 1; }

today="$(date -u +%Y-%m-%d)"
sed -i.bak "s/^## \[Unreleased\]/## [Unreleased]\n\n## [${version}] - ${today}/" "$action/CHANGELOG.md"
rm -f "$action/CHANGELOG.md.bak"

git add "$action/CHANGELOG.md"
git commit -m "chore(${action}): release ${version}"
git tag -a "$tag" -m "${action} ${version}"

if (( major >= 1 )); then
  git tag -f "$floating" "$tag"
  git push origin "$floating" --force
fi

git push origin "$tag"
gh release create "$tag" --title "${action} ${version}" --notes-from-tag
