#!/usr/bin/env bash
# Usage: actions-repo/scripts/release-action.sh <action> <patch|minor|major|x.y.z>
#
# Bumps the version of a duku-ai/actions action in chrome-worker and promotes
# its CHANGELOG '## [Unreleased]' section to '## [<version>] - <date>'.
#
# After running, review the diff and commit:
#   sl commit actions-repo/<action>/package.json actions-repo/<action>/CHANGELOG.md \
#     -m "chore(action/<action>): release <version>"
#   sl pr submit
#
# Once the PR is landed, the actions-repo-sync workflow auto-tags the release
# on Duku-AI/actions and publishes a GitHub Release. There is no manual step
# on the public repo.
set -euo pipefail

action="${1:?action required (e.g. preview, environment)}"
bump="${2:?bump required (patch|minor|major) or explicit semver (x.y.z)}"

dir="actions-repo/${action}"
pj="${dir}/package.json"
changelog="${dir}/CHANGELOG.md"

[[ -f "$pj" ]] || { echo "no such package.json: $pj" >&2; exit 1; }
[[ -f "$changelog" ]] || { echo "no such CHANGELOG.md: $changelog" >&2; exit 1; }

if ! grep -qE '^## \[Unreleased\]' "$changelog"; then
  echo "$changelog has no '## [Unreleased]' section to promote" >&2
  exit 1
fi

# Resolve target version.
current="$(jq -r .version "$pj")"
case "$bump" in
  patch|minor|major)
    # Use npm-style bump without git tagging or commit (sapling owns git ops).
    target="$(cd "$dir" && npm version "$bump" --no-git-tag-version --allow-same-version | tr -d 'v')"
    ;;
  [0-9]*.[0-9]*.[0-9]*)
    target="$bump"
    (cd "$dir" && npm version "$target" --no-git-tag-version --allow-same-version >/dev/null)
    ;;
  *)
    echo "bump must be patch|minor|major or x.y.z (got: ${bump})" >&2
    exit 1
    ;;
esac

# Promote [Unreleased] section.
today="$(date -u +%Y-%m-%d)"
# Portable in-place edit: write to a tempfile, then mv.
tmp="$(mktemp)"
awk -v ver="$target" -v today="$today" '
  /^## \[Unreleased\]/ && !done {
    print
    print ""
    print "## [" ver "] - " today
    done = 1
    next
  }
  { print }
' "$changelog" > "$tmp"
mv "$tmp" "$changelog"

echo "Bumped ${action}: ${current} -> ${target}"
echo "Updated ${pj} and ${changelog}."
echo
echo "Review the diff, then commit:"
echo "  sl commit ${pj} ${changelog} \\"
echo "    -m 'chore(action/${action}): release ${target}'"
