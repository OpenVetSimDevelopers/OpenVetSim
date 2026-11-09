#!/usr/bin/env bash
# ============================================================================
# download-php.sh
#
# Downloads static PHP CLI binaries for BOTH macOS arm64 and x86_64, then
# combines them into a single universal (fat) binary using lipo.
#
# Only a release with the October 2026 security fixes is accepted - see
# MIN_PATCH below. PHP 8.3 is preferred (what the web pages are tested on);
# 8.4 and 8.5 are used only if no fixed 8.3 build has been published.
#
# This is required for building a universal DMG with electron-builder --universal,
# which uses @electron/universal to merge the two arch builds. That tool rejects
# single-arch binaries that appear identically in both builds.
#
# Uses pre-built static binaries from the static-php-cli project CDN:
#   https://dl.static-php.dev/static-php-cli/common/   (common extensions)
#   https://dl.static-php.dev/static-php-cli/bulk/     (more extensions; used
#                                                       if common has no fix)
# The script reads the CDN's own file list and picks the newest fixed release
# offered for both architectures, rather than guessing file names.
#
# ⚠️  The CDN redirects through DigitalOcean Spaces, which is blocked on some
#     university/corporate networks. Run this script from a non-university
#     network (home internet, phone hotspot, VPN, etc.) if you are on campus.
#
# These binaries have no external library dependencies — they work on any
# macOS installation without Homebrew or any other package manager.
#
# Usage:
#   chmod +x scripts/download-php.sh
#   ./scripts/download-php.sh
#   PHP_VERSION=8.3.36 ./scripts/download-php.sh     (a specific release)
#
# Run this once before:
#   npm run dist:mac   (packaging a distributable DMG)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$REPO_ROOT/OpenVetSim/build/bin/PHP8.0"

BASE_URL="${PHP_CDN_URL:-https://dl.static-php.dev/static-php-cli}"
DIRS=(common bulk)

# Branches in order of preference, and the oldest patch release of each that
# may be bundled. 8.3.36 / 8.4.27 / 8.5.12 (21 Oct 2026) fix CVE-2026-109618
# and CVE-2026-109619, two critical remote-code-execution flaws. Raise these
# when a later security release comes out.
MINORS=(8.3 8.4 8.5)
min_patch() {
  case "$1" in
    8.3) echo 36 ;;
    8.4) echo 27 ;;
    8.5) echo 12 ;;
    *)   echo 999 ;;
  esac
}

# true if version $1 (x.y.z) is a branch we accept and at or above its minimum
is_fixed() {
  local minor="${1%.*}" patch="${1##*.}"
  [ "$(min_patch "$minor")" != 999 ] && [ "$patch" -ge "$(min_patch "$minor")" ]
}

# Newest first, numerically: 8.3.36 sorts above 8.3.9
sort_versions() { sort -t. -k1,1nr -k2,2nr -k3,3nr | uniq; }

# Versions the CDN directory $1 lists for arch $2 (aarch64 | x86_64), newest first
list_versions() {
  curl -fsSL --connect-timeout 10 --max-time 30 "${BASE_URL}/$1/" 2>/dev/null \
    | grep -oE "php-[0-9]+\.[0-9]+\.[0-9]+-cli-macos-$2\.tar\.gz" \
    | sed -E 's/^php-([0-9.]+)-cli-.*/\1/' \
    | sort_versions || true
}

# Does a file exist on the CDN? (used when the directory list can't be read)
exists() {
  local code
  code="$(curl -o /dev/null -w "%{http_code}" --silent --head --location \
           --connect-timeout 8 --max-time 10 "$1" 2>/dev/null || echo 000)"
  [ "$code" = "200" ]
}

# ---------------------------------------------------------------------------
# Choose a directory and a version available for both architectures.
# Sets CHOSEN_DIR and CHOSEN_VERSION.
# ---------------------------------------------------------------------------
CHOSEN_DIR=""
CHOSEN_VERSION=""
LISTED_ANY=0
SUMMARY=""

choose() {
  local dir arm x64 v minor
  for dir in "${DIRS[@]}"; do
    echo "Reading the file list in ${BASE_URL}/${dir}/ ..."
    arm="$(list_versions "$dir" aarch64)"
    x64="$(list_versions "$dir" x86_64)"
    if [ -z "$arm$x64" ]; then
      echo "  (no macOS builds listed, or the list could not be read)"
      : > "$LISTS/$dir"
      continue
    fi
    LISTED_ANY=1
    # versions offered for both architectures
    comm -12 <(echo "$arm" | sort) <(echo "$x64" | sort) | sort_versions > "$LISTS/$dir"

    # remember the newest of each branch, to report if nothing qualifies
    for minor in "${MINORS[@]}"; do
      v="$(awk -F. -v m="$minor" '$1"."$2 == m' "$LISTS/$dir" | head -1)"
      SUMMARY="${SUMMARY}  ${dir}/: newest ${minor}.x for both Mac architectures: ${v:-none}"$'\n'
    done
  done

  if [ -n "${PHP_VERSION:-}" ]; then
    for dir in "${DIRS[@]}"; do
      if grep -qx "$PHP_VERSION" "$LISTS/$dir"; then
        CHOSEN_DIR="$dir"; CHOSEN_VERSION="$PHP_VERSION"; return 0
      fi
    done
  else
    # the preferred branch first, from whichever collection has it fixed
    for minor in "${MINORS[@]}"; do
      for dir in "${DIRS[@]}"; do
        v="$(awk -F. -v m="$minor" '$1"."$2 == m' "$LISTS/$dir" | head -1)"
        if [ -n "$v" ] && is_fixed "$v"; then
          CHOSEN_DIR="$dir"; CHOSEN_VERSION="$v"; return 0
        fi
      done
    done
  fi

  # The directory list could not be read at all: fall back to probing names.
  if [ "$LISTED_ANY" = 0 ]; then
    echo ""
    echo "Could not read the CDN's file list; probing file names instead..."
    local patch min
    for dir in "${DIRS[@]}"; do
      for minor in "${MINORS[@]}"; do
        if [ -n "${PHP_VERSION:-}" ] && [ "${PHP_VERSION%.*}" != "$minor" ]; then continue; fi
        min="$(min_patch "$minor")"
        for patch in $(seq $((min + 24)) -1 "$min"); do
          v="${minor}.${patch}"
          if [ -n "${PHP_VERSION:-}" ] && [ "$v" != "$PHP_VERSION" ]; then continue; fi
          printf "  %s/%s ... " "$dir" "$v"
          if exists "${BASE_URL}/${dir}/php-${v}-cli-macos-aarch64.tar.gz" && \
             exists "${BASE_URL}/${dir}/php-${v}-cli-macos-x86_64.tar.gz"; then
            echo "found"
            CHOSEN_DIR="$dir"; CHOSEN_VERSION="$v"; return 0
          fi
          echo "no"
        done
      done
    done
  fi
  return 1
}

# ---------------------------------------------------------------------------
# download_php <spc_arch> <dest_file>
# ---------------------------------------------------------------------------
download_php() {
  local SPC_ARCH="$1"
  local OUT="$2"
  local ASSET="php-${CHOSEN_VERSION}-cli-macos-${SPC_ARCH}.tar.gz"
  local URL="${BASE_URL}/${CHOSEN_DIR}/${ASSET}"
  local TMP
  TMP="$(mktemp -d)"

  echo "Downloading ${CHOSEN_DIR}/${ASSET} ..."
  curl -fL --progress-bar "$URL" -o "$TMP/$ASSET"
  echo ""

  tar -xzf "$TMP/$ASSET" -C "$TMP"
  PHP_BIN="$(find "$TMP" -type f -name "php" | head -1)"
  if [ -z "$PHP_BIN" ]; then
    echo "ERROR: could not find 'php' binary in archive for ${SPC_ARCH}." >&2
    exit 1
  fi
  chmod +x "$PHP_BIN"
  cp "$PHP_BIN" "$OUT"
  rm -rf "$TMP"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if [ -n "${PHP_VERSION:-}" ] && ! is_fixed "$PHP_VERSION"; then
  echo "ERROR: PHP_VERSION=$PHP_VERSION is older than the fixed release for its branch" >&2
  echo "       (8.3.36 / 8.4.27 / 8.5.12), or not a supported branch. Refusing to bundle it." >&2
  exit 1
fi

echo "Building a universal (arm64 + x86_64) PHP binary for macOS..."
echo "(If this hangs, you may be on a network that blocks the CDN — try a VPN or home network)"
echo ""

LISTS="$(mktemp -d)"
trap 'rm -rf "$LISTS"' EXIT

if ! choose; then
  echo "" >&2
  echo "ERROR: No fixed PHP release (8.3.36 / 8.4.27 / 8.5.12 or newer) is on the CDN" >&2
  echo "       for both Mac architectures${PHP_VERSION:+ matching PHP_VERSION=$PHP_VERSION}." >&2
  if [ -n "$SUMMARY" ]; then
    echo "       What it does offer:" >&2
    printf "%s" "$SUMMARY" >&2
  else
    echo "       The CDN could not be reached - on a university/corporate network," >&2
    echo "       try a home network, phone hotspot or VPN." >&2
  fi
  echo "       Do not fall back to an older PHP: earlier releases have critical" >&2
  echo "       security flaws. The bundled PHP has not been changed." >&2
  echo "" >&2
  echo "       To build a fixed PHP from php.net's source instead (5-15 minutes):" >&2
  echo "         ./scripts/build-php-mac.sh" >&2
  exit 1
fi

echo ""
echo "Using PHP ${CHOSEN_VERSION} from ${CHOSEN_DIR}/"
if [ "${CHOSEN_VERSION%.*}" != "8.3" ]; then
  echo "NOTE: no fixed 8.3 build was available, so this is PHP ${CHOSEN_VERSION%.*}." >&2
  echo "      Test the instructor interface and student monitor before releasing." >&2
fi
echo ""

TMP_ARM64="$(mktemp)"
TMP_X64="$(mktemp)"
TMP_UNI="$(mktemp)"
trap 'rm -f "$TMP_ARM64" "$TMP_X64" "$TMP_UNI"; rm -rf "$LISTS"' EXIT

download_php "aarch64" "$TMP_ARM64"
download_php "x86_64"  "$TMP_X64"

echo "Creating universal binary with lipo..."
lipo -create "$TMP_ARM64" "$TMP_X64" -output "$TMP_UNI"
chmod +x "$TMP_UNI"

echo ""
echo "Verifying universal binary:"
lipo -info "$TMP_UNI"

# Check the binary itself reports a fixed version before it replaces anything.
# (Runs the slice for this Mac; the other slice was checked by name above.)
REPORTED="$("$TMP_UNI" -r 'echo PHP_VERSION;')"
if ! is_fixed "$REPORTED"; then
  echo "ERROR: the downloaded PHP reports $REPORTED - not a fixed release." >&2
  echo "       The bundled PHP was left as it was." >&2
  exit 1
fi
"$TMP_UNI" -v | head -1

# Only now replace the bundled copy, so a failed download never leaves the
# build without PHP.
rm -rf "$DEST"
mkdir -p "$DEST"
cp "$TMP_UNI" "$DEST/php"
chmod +x "$DEST/php"

echo ""
echo "Done. Universal PHP is ready at:"
echo "  $DEST/php"
echo ""
echo "Verify with:"
echo "  '$DEST/php' --version"
