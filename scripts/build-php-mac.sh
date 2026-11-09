#!/usr/bin/env bash
# ============================================================================
# build-php-mac.sh
#
# Builds PHP from the official php.net source as a universal (arm64 + x86_64)
# macOS binary and installs it as the bundled PHP:
#   OpenVetSim/build/bin/PHP8.0/php
#
# Use this when download-php.sh can't find a fixed release on the static-php
# CDN - the CDN lags php.net by weeks. (Nov 2026: CDN newest 8.3.32; the
# October security fixes are in 8.3.36.)
#
# What it builds: PHP CLI with only what OpenVetSim's web pages use - session,
# SimpleXML/DOM/XML, JSON, filter, ctype, hash, zlib, mysqli (for the optional
# database mode) and the always-on core. It links only against libraries
# that are part of macOS itself (libxml2, zlib), so the binary runs on any
# Mac from macOS 12, like the app, with nothing else installed.
#
# Needs:  Xcode Command Line Tools (xcode-select --install)
#         Rosetta 2 on an Apple-silicon Mac, to build the Intel half
#           (softwareupdate --install-rosetta --agree-to-license)
#         Network access to www.php.net
# Takes:  roughly 5-10 minutes. (Rosetta runs the Intel half's test programs.)
#
# Usage:
#   ./scripts/build-php-mac.sh            # builds 8.3.36
#   ./scripts/build-php-mac.sh 8.3.37     # a later release
#
# Then rebuild the app (npm run dist:mac) as usual.
# ============================================================================

set -euo pipefail

VERSION="${1:-${PHP_BUILD_VERSION:-8.3.36}}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST="$REPO_ROOT/OpenVetSim/build/bin/PHP8.0"

DIST_URL="${PHP_DIST_URL:-https://www.php.net/distributions}"
RELEASES_URL="${PHP_RELEASES_URL:-https://www.php.net/releases/}"
MACOS_MIN="12.0"

# The oldest release of each branch with the October 2026 security fixes
# (CVE-2026-109618, CVE-2026-109619). Same table as download-php.sh.
min_patch() {
  case "$1" in
    8.3) echo 36 ;;
    8.4) echo 27 ;;
    8.5) echo 12 ;;
    *)   echo 999 ;;
  esac
}
is_fixed() {
  local minor="${1%.*}" patch="${1##*.}"
  case "$patch" in ''|*[!0-9]*) return 1 ;; esac
  [ "$(min_patch "$minor")" != 999 ] && [ "$patch" -ge "$(min_patch "$minor")" ]
}

# What the web pages need; the build is rejected if any is missing.
REQUIRED_MODULES="session SimpleXML dom libxml xml json filter ctype hash pcre zlib"

CONFIGURE_OPTS=(
  --disable-all --enable-cli --disable-cgi --disable-phpdbg --without-pear
  --enable-session --enable-filter --enable-ctype
  --with-libxml --enable-simplexml --enable-xml --enable-dom
  --enable-xmlreader --enable-xmlwriter
  --with-zlib --enable-tokenizer --enable-posix
  --enable-mysqlnd --with-mysqli=mysqlnd
)

die() { echo "ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
is_fixed "$VERSION" || die "PHP $VERSION is not a release with the October 2026 security fixes (8.3.36 / 8.4.27 / 8.5.12 or newer)."

xcode-select -p >/dev/null 2>&1 || die "Xcode Command Line Tools are not installed. Run:  xcode-select --install"
SDK="$(xcrun --show-sdk-path)"
[ -d "$SDK" ] || die "Could not find the macOS SDK (xcrun --show-sdk-path)."

# The Mac's real processor. (uname -m says x86_64 in a Terminal running under
# Rosetta, even on Apple silicon; hw.optional.arm64 does not.)
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  HOST_ARCH=arm64
else
  HOST_ARCH=x86_64
fi
if [ "$HOST_ARCH" = "arm64" ]; then
  arch -x86_64 /usr/bin/true 2>/dev/null || die "Rosetta 2 is needed to build the Intel half. Run:
    softwareupdate --install-rosetta --agree-to-license"
fi

NCPU="$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/ovs-php-build.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$REPO_ROOT/OpenVetSim/build"
LOG="$REPO_ROOT/OpenVetSim/build/php-build.log"   # kept after the script ends
: > "$LOG"

echo "Building PHP $VERSION for macOS (arm64 + x86_64) in $WORK"
echo ""

# ---------------------------------------------------------------------------
# Source, verified against php.net's published checksum
# ---------------------------------------------------------------------------
TARBALL="php-${VERSION}.tar.xz"
echo "Downloading ${DIST_URL}/${TARBALL} ..."
curl -fL --progress-bar "${DIST_URL}/${TARBALL}" -o "$WORK/$TARBALL" \
  || die "Could not download the PHP source. Check the network (and the version number)."

echo "Checking it against php.net's checksum ..."
curl -fsSL "${RELEASES_URL}?json&version=${VERSION}" -o "$WORK/release.json" \
  || die "Could not read php.net's release information for $VERSION."
EXPECTED="$(/usr/bin/python3 - "$WORK/release.json" "$TARBALL" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for s in data.get("source", []):
    if s.get("filename") == sys.argv[2]:
        print(s.get("sha256", ""))
        break
PY
)"
[ -n "$EXPECTED" ] || die "php.net lists no checksum for $TARBALL."
ACTUAL="$(shasum -a 256 "$WORK/$TARBALL" | awk '{print $1}')"
[ "$ACTUAL" = "$EXPECTED" ] || die "Checksum mismatch for $TARBALL - download corrupt or tampered with."
echo "  SHA-256 verified."
echo ""

# ---------------------------------------------------------------------------
# Build one architecture in its own copy of the source
# ---------------------------------------------------------------------------
build_arch() {
  local A="$1" DIR="$WORK/src-$1" CROSS=()
  mkdir -p "$DIR"
  tar -xJf "$WORK/$TARBALL" -C "$DIR" --strip-components=1

  # Building arm64 on an Intel Mac is a cross-compile
  if [ "$HOST_ARCH" = "x86_64" ] && [ "$A" = "arm64" ]; then
    CROSS=(--host=aarch64-apple-darwin --build=x86_64-apple-darwin)
  fi

  # Building x86_64 on an Apple-silicon Mac is also a cross-compile: Apple's
  # compiler runs natively and is told to produce Intel code. (Running the
  # compiler itself under Rosetta fails on recent macOS, whose developer tools
  # no longer include an Intel copy of the compiler.) Configure's test
  # programs still run, under Rosetta, so it is treated as a native build.
  if [ "$HOST_ARCH" = "arm64" ] && [ "$A" = "x86_64" ]; then
    CROSS=(--host=x86_64-apple-darwin --build=aarch64-apple-darwin)
  fi
  # On Apple silicon, always run the compiler natively, even if this Terminal
  # happens to be running under Rosetta.
  local RUN=()
  if [ "$HOST_ARCH" = "arm64" ]; then
    RUN=(arch -arm64)
  fi

  echo "Building $A (log: $LOG) ..."
  # A clean environment: only Apple's tools and the macOS SDK. Homebrew's
  # pkg-config, headers or libraries must not leak into the build, or the
  # binary would depend on files that aren't on other Macs.
  ( cd "$DIR" && env -i \
      HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" \
      PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
      MACOSX_DEPLOYMENT_TARGET="$MACOS_MIN" \
      CC="clang -arch $A" \
      CFLAGS="-O2 -mmacosx-version-min=$MACOS_MIN" \
      LDFLAGS="-arch $A -mmacosx-version-min=$MACOS_MIN" \
      PKG_CONFIG=/usr/bin/false \
      LIBXML_CFLAGS="-I$SDK/usr/include/libxml2" LIBXML_LIBS="-lxml2" \
      ZLIB_CFLAGS="-I$SDK/usr/include" ZLIB_LIBS="-lz" \
      ${RUN[@]+"${RUN[@]}"} /bin/bash -c '
        ./configure "$@" && make -j'"$NCPU"'
      ' _ "${CONFIGURE_OPTS[@]}" ${CROSS[@]+"${CROSS[@]}"} ) >>"$LOG" 2>&1 \
    || {
         # configure's own detail is in config.log, inside the temporary
         # folder that is deleted on exit - keep the end of it in the log
         if [ -f "$DIR/config.log" ]; then
           { echo ""; echo "==== end of config.log ($A) ===="; tail -80 "$DIR/config.log"; } >>"$LOG"
         fi
         tail -40 "$LOG" >&2
         die "The $A build failed (last lines above; full log in $LOG)."
       }

  local BIN="$DIR/sapi/cli/php"
  [ -x "$BIN" ] || die "The $A build produced no php binary."
  [ "$(lipo -archs "$BIN")" = "$A" ] || die "The $A build produced a $(lipo -archs "$BIN") binary."

  # Only system libraries may be linked
  if otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -vE '^(/usr/lib/|/System/)' ; then
    die "The $A binary links a library outside macOS (listed above) - it would not run on other Macs."
  fi
  cp "$BIN" "$WORK/php-$A"
  echo "  $A done."
}

build_arch arm64
build_arch x86_64

# ---------------------------------------------------------------------------
# Combine, check, install
# ---------------------------------------------------------------------------
echo ""
echo "Creating universal binary ..."
lipo -create "$WORK/php-arm64" "$WORK/php-x86_64" -output "$WORK/php"
chmod +x "$WORK/php"
lipo -info "$WORK/php"

for A in arm64 x86_64; do
  if [ "$A" = "$HOST_ARCH" ] || [ "$A" = "x86_64" ]; then
    RUNNER=()
    [ "$HOST_ARCH" = "arm64" ] && RUNNER=(arch "-$A")
    REPORTED="$(${RUNNER[@]+"${RUNNER[@]}"} "$WORK/php" -r 'echo PHP_VERSION;')"
    [ "$REPORTED" = "$VERSION" ] || die "The $A slice reports PHP $REPORTED, expected $VERSION."
    MODULES="$(${RUNNER[@]+"${RUNNER[@]}"} "$WORK/php" -m)"
    for M in $REQUIRED_MODULES; do
      echo "$MODULES" | grep -qx "$M" || die "The $A slice is missing the $M extension."
    done
    # parse a scenario-like document and start a session, as the pages do
    ${RUNNER[@]+"${RUNNER[@]}"} "$WORK/php" -r '
      $x = simplexml_load_string("<scenario><title><name>t</name></title></scenario>");
      if ((string)$x->title->name !== "t") exit(1);
      if (json_encode(["a" => 1]) !== "{\"a\":1}") exit(2);
      if (filter_var("5", FILTER_VALIDATE_INT) !== 5) exit(3);' \
      || die "The $A slice failed its smoke test."
    echo "  $A slice: PHP $REPORTED, extensions and smoke test OK"
  fi
done

rm -rf "$DEST"
mkdir -p "$DEST"
cp "$WORK/php" "$DEST/php"
chmod +x "$DEST/php"

echo ""
echo "Done. PHP $VERSION (universal) is ready at:"
echo "  $DEST/php"
echo ""
echo "Next: rebuild the app (npm run dist:mac)."
