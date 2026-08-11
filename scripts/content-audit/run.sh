#!/usr/bin/env bash
# scripts/content-audit/run.sh
#
# Content audit for this public template. Greps the working tree for known
# real-deployment literals (banned-patterns.txt) and checks a few structural
# rules (no tracked binary assets outside a small SVG allowlist, no stray
# .env files, sane/fresh git history).
#
# Exit 0  -> no known-pattern findings. This is NOT a clean bill of health,
#            it only means nothing on the known-literals list was found.
#            Human review of the tree is still required before publishing.
# Exit 1  -> at least one finding. A readable report is printed to stdout.
# Exit 2  -> the script itself is misconfigured (e.g. missing patterns file).
#
# Written to run on bash 3.2+ (macOS default) and GNU bash on CI (Ubuntu).
# Avoids mapfile/readarray and associative arrays for that reason.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PATTERNS_FILE="$SCRIPT_DIR/banned-patterns.txt"
# Private, gitignored overlay: deployment-specific real literals live here
# instead of in the public PATTERNS_FILE above. Optional — loaded only if it
# exists, so a fresh clone of the public template (which never ships this
# file) still runs the generic checks with no configuration needed.
LOCAL_PATTERNS_FILE="$SCRIPT_DIR/banned-patterns.local.txt"
# Same overlay idea, for PATHS instead of literals: a real deployment that
# commits its own brand assets (logo SVGs, etc.) somewhere other than
# frontend/public|app lists those path prefixes here instead of editing this
# public script. Gitignored, optional, and only honored in "deployment" mode
# — see MODE_FILE below. See section 2a for how it's used.
ASSET_ALLOW_LOCAL_FILE="$SCRIPT_DIR/asset-allow.local.txt"
# template-mode vs deployment-mode switch. A fresh clone of the public
# template has no scripts/content-audit/mode file, so it defaults to
# "template" — the strictest behavior, unchanged from before this switch
# existed. A real deployment that has been through disaster-brand and wants
# its own committed assets to stop tripping the audit sets this file to
# "deployment" (see CONTRIBUTING.md "go-live", or the disaster-content-audit
# skill, for the exact command). Kept as
# a plain file rather than an env var so it's a durable, committed decision
# that shows up in `git diff`, not something a stray shell env can flip.
MODE_FILE="$SCRIPT_DIR/mode"
AUDIT_MODE="template"
if [ -f "$MODE_FILE" ]; then
  AUDIT_MODE="$(tr -d '[:space:]' < "$MODE_FILE")"
fi
case "$AUDIT_MODE" in
  template|deployment) : ;;
  *)
    echo "content-audit: scripts/content-audit/mode has an unknown value ('$AUDIT_MODE'); expected 'template' or 'deployment'. Falling back to 'template' (the stricter mode)." >&2
    AUDIT_MODE="template"
    ;;
esac

cd "$REPO_ROOT" || exit 2

if [ ! -f "$PATTERNS_FILE" ]; then
  echo "content-audit: missing $PATTERNS_FILE" >&2
  exit 2
fi

# --- temp files (declared up front so the EXIT trap never sees an unbound
#     variable under `set -u`, regardless of where the script bails out) ----
REPORT_TMP=""
HARD_PAT_TMP=""
HARD_CS_PAT_TMP=""
CONTEXT_PAT_TMP=""
FILELIST_TMP=""
CONTENT_FILELIST_TMP=""
CONTEXT_FILELIST_TMP=""

cleanup() {
  rm -f "$REPORT_TMP" "$HARD_PAT_TMP" "$HARD_CS_PAT_TMP" "$CONTEXT_PAT_TMP" \
        "$FILELIST_TMP" "$CONTENT_FILELIST_TMP" "$CONTEXT_FILELIST_TMP"
}
trap cleanup EXIT

REPORT_TMP="$(mktemp)"
HARD_PAT_TMP="$(mktemp)"
HARD_CS_PAT_TMP="$(mktemp)"
CONTEXT_PAT_TMP="$(mktemp)"
FILELIST_TMP="$(mktemp)"
CONTENT_FILELIST_TMP="$(mktemp)"
CONTEXT_FILELIST_TMP="$(mktemp)"

FINDINGS=0

report() {
  printf '%s\n' "$1" >> "$REPORT_TMP"
  FINDINGS=$((FINDINGS + 1))
}

# ===========================================================================
# 0. Enumerate the working tree once, excluding noise directories.
#    (.git, node_modules, .next, .open-next, .wrangler — the last two are
#    Cloudflare Workers build output, gitignored; applied consistently to
#    every check below, not just the grep pass, so the audit doesn't drown
#    in third-party node_modules or build-output assets.)
# ===========================================================================
find . \
  \( -path './.git' -o -path '*/node_modules' -o -path '*/.next' \
     -o -path '*/.open-next' -o -path '*/.wrangler' \) -prune -o \
  -type f -print > "$FILELIST_TMP"

# Content-scan file list: same, minus the pattern file(s) themselves (they
# have to contain the banned literals verbatim in order to ban them, so they
# would always self-match otherwise), minus .svg files and anything under a
# "generated/" directory.
#
# WHY .svg AND /generated/ ARE EXCLUDED FROM THIS SPECIFIC SCAN:
# the hard-banned "any public IPv4" pattern matches decimal-dotted number
# sequences, and real SVG <path> coordinate data is exactly that shape —
# "M652.17,195.34c-4.95,0-9.11…" — so any hand-drawn or complex SVG logo
# trips a [hard-banned] false positive purely on numeric coincidence. The
# same happens to a generated TS/JS file that embeds that same SVG as a
# data-URI (e.g. a codegen'd lib/generated/brand-logo.ts). No real coverage
# is lost: SVGs still go through the [banned-svg-payload]/[banned-svg-location]
# checks below (no <image> tag, no base64, only in an allowed directory) and
# through the human EXIF/GPS review checklist — what's lost is a false
# positive that, tripping on every run, is exactly what makes people stop
# reading the report.
SELF="./scripts/content-audit/banned-patterns.txt"
SELF_LOCAL="./scripts/content-audit/banned-patterns.local.txt"
grep -v -F -x -e "$SELF" -e "$SELF_LOCAL" "$FILELIST_TMP" \
  | grep -v -E '\.svg$|/generated/' > "$CONTENT_FILELIST_TMP" || true

# Context-banned allowlist: documentation surfaces where the template's own
# origin-story words (see the CONTEXT: patterns in banned-patterns.txt) are
# expected prose, not an accidental real-world tie. Root-level *.md (README,
# CONTRIBUTING, SECURITY, AGENTS, CLAUDE, …) plus the whole docs/ tree — does
# NOT exempt nested docs like admin/README.md or frontend/AGENTS.md, and the
# ban stays firm everywhere else: frontend/, backend/, admin/, infra/,
# config/, which is where a copied-in literal would actually break or leak
# something.
is_allowlisted() {
  case "$1" in
    ./docs/*) return 0 ;;
  esac
  # NOTE: a bare `./*.md` case pattern would ALSO match nested paths like
  # ./frontend/README.md — case/glob `*` matches `/` too, it is not scoped
  # to one path segment. So root-only is enforced explicitly: strip the
  # leading "./" and reject anything with a further "/" in it.
  case "$1" in
    ./*.md)
      case "${1#./}" in
        */*) return 1 ;;
        *) return 0 ;;
      esac
      ;;
  esac
  return 1
}
: > "$CONTEXT_FILELIST_TMP"
while IFS= read -r f; do
  if ! is_allowlisted "$f"; then
    printf '%s\n' "$f" >> "$CONTEXT_FILELIST_TMP"
  fi
done < "$CONTENT_FILELIST_TMP"

# ===========================================================================
# 1. banned-patterns.txt: hard-banned (everywhere) vs context-banned
#    (everywhere except the allowlist above).
# ===========================================================================
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|'#'*) continue ;;
    CONTEXT:*) printf '%s\n' "${line#CONTEXT:}" >> "$CONTEXT_PAT_TMP" ;;
    CASESENSITIVE:*) printf '%s\n' "${line#CASESENSITIVE:}" >> "$HARD_CS_PAT_TMP" ;;
    *) printf '%s\n' "$line" >> "$HARD_PAT_TMP" ;;
  esac
done < "$PATTERNS_FILE"

if [ -f "$LOCAL_PATTERNS_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
      CONTEXT:*) printf '%s\n' "${line#CONTEXT:}" >> "$CONTEXT_PAT_TMP" ;;
      CASESENSITIVE:*) printf '%s\n' "${line#CASESENSITIVE:}" >> "$HARD_CS_PAT_TMP" ;;
      *) printf '%s\n' "$line" >> "$HARD_PAT_TMP" ;;
    esac
  done < "$LOCAL_PATTERNS_FILE"
fi

# Build bash arrays from the file lists (portable on bash 3.2, no mapfile).
content_files=()
while IFS= read -r f; do
  content_files+=("$f")
done < "$CONTENT_FILELIST_TMP"

context_files=()
while IFS= read -r f; do
  context_files+=("$f")
done < "$CONTEXT_FILELIST_TMP"

if [ -s "$HARD_PAT_TMP" ] && [ "${#content_files[@]}" -gt 0 ]; then
  hard_hits="$(grep -H -n -i -I -E -f "$HARD_PAT_TMP" -- "${content_files[@]}" 2>/dev/null || true)"
  if [ -n "$hard_hits" ]; then
    while IFS= read -r hit; do
      [ -n "$hit" ] && report "[hard-banned]    $hit"
    done <<HARDHITS
$hard_hits
HARDHITS
  fi
fi

if [ -s "$HARD_CS_PAT_TMP" ] && [ "${#content_files[@]}" -gt 0 ]; then
  hard_cs_hits="$(grep -H -n -I -E -f "$HARD_CS_PAT_TMP" -- "${content_files[@]}" 2>/dev/null || true)"
  if [ -n "$hard_cs_hits" ]; then
    while IFS= read -r hit; do
      [ -n "$hit" ] && report "[hard-banned]    $hit"
    done <<HARDCSHITS
$hard_cs_hits
HARDCSHITS
  fi
fi

if [ -s "$CONTEXT_PAT_TMP" ] && [ "${#context_files[@]}" -gt 0 ]; then
  context_hits="$(grep -H -n -i -I -E -f "$CONTEXT_PAT_TMP" -- "${context_files[@]}" 2>/dev/null || true)"
  if [ -n "$context_hits" ]; then
    while IFS= read -r hit; do
      [ -n "$hit" ] && report "[context-banned] $hit  (allowed only in root *.md files and docs/**)"
    done <<CONTEXTHITS
$context_hits
CONTEXTHITS
  fi
fi

# ===========================================================================
# 2a. Binary/vector assets: banned everywhere except a small allowlist of
#     directories. The built-in allowlist is always frontend/public/ and
#     frontend/app/ (where Next.js expects icons/OG images/etc to live).
#
#     In "deployment" mode ONLY, that allowlist can be widened with extra
#     path prefixes from a private, gitignored overlay file
#     (asset-allow.local.txt — same idea as banned-patterns.local.txt, for
#     paths instead of literals). This exists for real deployments that
#     commit their own brand assets (logos, favicons, OG images) somewhere
#     other than frontend/public|app — e.g. a top-level brand/ directory —
#     without having to edit this public script to do it. In "template"
#     mode (the default — see MODE_FILE above), that overlay file is
#     IGNORED even if present, so a fresh clone of the public template keeps
#     the strict original behavior no matter what a stray local file says.
#
#     Binary raster extensions were historically banned even inside the
#     allowed directories (SVG was the only asset type ever allowed at
#     all). In "deployment" mode, any prefix on the allowlist — built-in or
#     from the overlay — allows BOTH binary extensions and SVGs, since a
#     real deployment's brand kit is not always vector-only (a favicon.ico
#     or an OG PNG under frontend/public/ is completely ordinary). In
#     "template" mode, binary extensions stay banned everywhere, full stop
#     — only SVGs get the directory allowlist, exactly like before this
#     mechanism existed.
# ===========================================================================
ASSET_ALLOW_PREFIXES="./frontend/public/ ./frontend/app/"
if [ "$AUDIT_MODE" = "deployment" ] && [ -f "$ASSET_ALLOW_LOCAL_FILE" ]; then
  while IFS= read -r prefix || [ -n "$prefix" ]; do
    case "$prefix" in
      ''|'#'*) continue ;;
    esac
    ASSET_ALLOW_PREFIXES="$ASSET_ALLOW_PREFIXES $prefix"
  done < "$ASSET_ALLOW_LOCAL_FILE"
elif [ "$AUDIT_MODE" = "template" ] && [ -f "$ASSET_ALLOW_LOCAL_FILE" ]; then
  echo "content-audit: scripts/content-audit/asset-allow.local.txt exists but mode is 'template' — ignoring it. Switch scripts/content-audit/mode to 'deployment' to honor it." >&2
fi

is_asset_allowed() {
  # $1 = path as printed by find (starts with ./)
  for prefix in $ASSET_ALLOW_PREFIXES; do
    case "$1" in
      "$prefix"*) return 0 ;;
    esac
  done
  return 1
}

# Self-hosted webfonts are a TEMPLATE convention, not a deployment identity
# concern — this template itself ships frontend/app/fonts/*.woff2 (see
# frontend/app/layout.tsx and offline-build-frontend in ci.yml: build-time
# network calls to Google Fonts broke a real deploy once, so the fonts are
# committed instead of fetched). That makes this exemption unconditional —
# active in BOTH modes, unlike ASSET_ALLOW_PREFIXES above — and scoped
# narrowly to font extensions only, so it can't be used to smuggle in an
# image.
FONT_EXTS="woff woff2 ttf otf"
FONT_ALLOW_PREFIXES="./frontend/app/fonts/ ./frontend/public/fonts/"
is_font_allowed() {
  # $1 = path as printed by find (starts with ./)
  for prefix in $FONT_ALLOW_PREFIXES; do
    case "$1" in
      "$prefix"*) return 0 ;;
    esac
  done
  return 1
}

BANNED_EXTS="jpg jpeg png gif webp ico woff woff2 ttf otf mp4 pdf"
while IFS= read -r f; do
  lower_f="$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')"
  for ext in $BANNED_EXTS; do
    case "$lower_f" in
      *".$ext")
        case " $FONT_EXTS " in
          *" $ext "*)
            is_font_allowed "$f" && continue 2
            ;;
        esac
        if [ "$AUDIT_MODE" = "deployment" ] && is_asset_allowed "$f"; then
          continue 2
        fi
        report "[banned-extension] $f  (.$ext assets are not allowed in this template; use small inline SVG/text, a self-hosted font under frontend/app/fonts/, or — in deployment mode — an allowed asset directory)"
        ;;
    esac
  done
done < "$FILELIST_TMP"

# SVGs: allowed under an allowed directory (see ASSET_ALLOW_PREFIXES above —
# frontend/public|app always; more in deployment mode), and wherever they
# ARE allowed they must still be plain vector markup — no <image> tags, no
# embedded base64. That check is the one with teeth: it's what stops a
# raster photo being smuggled inside an .svg, so it runs across every
# allowed directory, not just the built-in ones.
while IFS= read -r f; do
  lower_f="$(printf '%s' "$f" | tr '[:upper:]' '[:lower:]')"
  case "$lower_f" in
    *.svg) : ;;
    *) continue ;;
  esac
  if is_asset_allowed "$f"; then
    if grep -q -i -E '<image|base64' -- "$f" 2>/dev/null; then
      report "[banned-svg-payload] $f  (svg must not contain an <image> tag or a base64 payload)"
    fi
  else
    report "[banned-svg-location] $f  (svg files belong under one of: $ASSET_ALLOW_PREFIXES)"
  fi
done < "$FILELIST_TMP"

# ===========================================================================
# 2b. No .env files other than .env.example may actually ship. Local
#     .env.local / .env.test.local fixtures are fine as long as .gitignore
#     keeps them out of the published tree (this template's convention) — so
#     a file only counts as a finding if it's tracked, or untracked-but-not-
#     ignored (i.e. `git add .` would pick it up).
# ===========================================================================
IN_GIT_REPO=0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 && IN_GIT_REPO=1

while IFS= read -r f; do
  base="${f##*/}"
  case "$base" in
    .env.example) continue ;;
    .env*) : ;;
    *) continue ;;
  esac
  if [ "$IN_GIT_REPO" -eq 1 ]; then
    if git check-ignore -q -- "$f" 2>/dev/null; then
      continue # gitignored local fixture — cannot leak into the published tree
    fi
  fi
  report "[banned-env-file] $f  (only .env.example may be committed/published; real .env files must stay gitignored)"
done < "$FILELIST_TMP"

# ===========================================================================
# 2c. Git history sanity: right after templating a fresh fork, the history
#     should be small and recent — a big/old history usually means the
#     original project's history (or some other repo's) leaked in.
#
#     This only runs ONCE per repo, gated on a marker file
#     (scripts/content-audit/.content-audit-fresh, committed by the public
#     template). Why: a commit-count check has no sensible threshold that
#     works both "right after forking" AND "two months into a real
#     deployment" — a live deployment's OWN history legitimately grows past
#     any fixed number, so a check that runs forever eventually trips on
#     every single run and gets ignored, right when it might actually catch
#     something. Gating it on the marker's presence, and deleting the
#     marker once the check has run, means: it fires exactly once (whenever
#     the marker still exists — including, deliberately, in CI for any PR
#     that hasn't removed it yet), and then gets out of the way permanently
#     once a human commits its removal. See CONTRIBUTING.md for the exact
#     step (part of the standard fork/rename flow).
#
#     The marker is deleted from the WORKING TREE below regardless of
#     pass/fail — a failing first run still reports the finding same as
#     always (exit 1 further down), it just won't be asked again next time.
#     Deleting the local file does nothing to a fresh CI checkout by itself;
#     it only takes effect once someone commits that deletion.
# ===========================================================================
CUTOFF_DATE="2026-07-10"
FRESH_MARKER="$SCRIPT_DIR/.content-audit-fresh"

if [ ! -f "$FRESH_MARKER" ]; then
  echo "content-audit: scripts/content-audit/.content-audit-fresh not present; skipped the one-time git-history sanity check (already run, or this checkout predates the marker)." >&2
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  commit_count="$(git rev-list --all --count 2>/dev/null || echo 0)"

  if [ "${commit_count:-0}" -gt 50 ] 2>/dev/null; then
    report "[git-history] $commit_count commits found (sanity limit is 50 for a freshly-templated repo) — verify this is not the original project's history"
  fi

  if [ "${commit_count:-0}" -gt 0 ] 2>/dev/null; then
    # Explicit 00:00:00 matters: BSD/macOS `date -j -f` fills any field the
    # format string omits (H:M:S here) from the CURRENT time, not midnight,
    # so a bare "%Y-%m-%d" format would make the cutoff silently track "now".
    cutoff_epoch="$(date -u -d "$CUTOFF_DATE 00:00:00" +%s 2>/dev/null || date -u -j -f '%Y-%m-%d %H:%M:%S' "$CUTOFF_DATE 00:00:00" +%s 2>/dev/null || echo "")"
    if [ -n "$cutoff_epoch" ]; then
      while IFS=' ' read -r csha ctime; do
        [ -z "$csha" ] && continue
        if [ "$ctime" -lt "$cutoff_epoch" ] 2>/dev/null; then
          human_date="$(date -u -d "@$ctime" +%Y-%m-%d 2>/dev/null || date -u -r "$ctime" +%Y-%m-%d 2>/dev/null || echo "$ctime")"
          report "[git-history] commit $csha predates $CUTOFF_DATE (committed $human_date) — verify this is not the original project's history"
        fi
      done < <(git log --all --format='%H %ct' 2>/dev/null || true)
    else
      echo "[git-history] could not determine cutoff epoch for $CUTOFF_DATE on this system; skipped the pre-$CUTOFF_DATE commit check" >&2
    fi
  fi

  rm -f "$FRESH_MARKER"
  echo "content-audit: one-time git-history check ran; removed scripts/content-audit/.content-audit-fresh from the working tree. Commit that removal (git add -A && git commit) so future runs — local and CI — stop running this check." >&2
else
  # Marker present, but not a git checkout at all (e.g. an extracted zip) —
  # nothing to sanity check, and that by itself isn't a content-security
  # finding. Leave the marker in place: there was no git history to check,
  # so this wasn't a real "first pass".
  echo "[git-history] not inside a git working tree; skipped the history sanity check" >&2
fi

# ===========================================================================
# Report
# ===========================================================================
if [ "$FINDINGS" -gt 0 ]; then
  echo "content-audit: FAIL — $FINDINGS finding(s)"
  echo "===================================================================="
  cat "$REPORT_TMP"
  echo "===================================================================="
  exit 1
fi

echo "no known-pattern findings — cannot confirm clean; human review of the tree is still required before publishing"
exit 0
