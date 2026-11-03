#!/usr/bin/env bash
# Build this checkout as a macOS desktop app and install it over the existing app, with a
# rollback copy and checks. Run it from a terminal outside T3: installing quits T3, and every
# T3 thread stops.
#
#   scripts/install-omp-desktop.sh                      build, confirm, install, verify
#   scripts/install-omp-desktop.sh --yes                no confirmation prompt
#   scripts/install-omp-desktop.sh --build-only         build and check, do not install
#   scripts/install-omp-desktop.sh --debug-port 9333    launch with Chrome DevTools on 127.0.0.1
#   scripts/install-omp-desktop.sh --rollback           restore the rollback copy
#
# Environment: T3_APP (installed app path), T3_ROLLBACK (rollback copy path),
# T3_REQUIRE (comma-separated strings app.asar must contain).
set -euo pipefail

APP="${T3_APP:-/Applications/T3 Code OMP.app}"
ROLLBACK="${T3_ROLLBACK:-/tmp/T3-Code-OMP.rollback.app}"
BUNDLE_ID="com.t3tools.t3code"
REQUIRE="${T3_REQUIRE:-needsPiStatusRefresh}"
ASSUME_YES=0
BUILD_ONLY=0
DEBUG_PORT=""
ROLLBACK_ONLY=0

fail() {
  printf 'install-omp-desktop: %s\n' "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --build-only) BUILD_ONLY=1 ;;
    --debug-port)
      DEBUG_PORT="${2:-}"
      [[ "$DEBUG_PORT" =~ ^[0-9]+$ ]] || fail "--debug-port needs a port number"
      shift
      ;;
    --rollback) ROLLBACK_ONLY=1 ;;
    -h | --help)
      sed -n '2,13p' "$0"
      exit 0
      ;;
    *) fail "unknown option: $1" ;;
  esac
  shift
done

[[ "$(uname -s)" == "Darwin" ]] || fail "macOS only"

# Installing quits T3, which kills a shell that T3 itself started.
pid=$$
while [[ "$pid" -gt 1 ]]; do
  command=$(ps -o comm= -p "$pid" 2>/dev/null || true)
  [[ "$command" == *"T3 Code"* ]] && fail "running inside T3; run this from another terminal"
  pid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || echo 1)
done

quit_t3() {
  osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  for _ in $(seq 1 40); do
    pgrep -f 'T3 Code \(Beta\)' >/dev/null || return 0
    sleep 0.5
  done
  fail "T3 is still running after quit; close it and retry"
}

launch_t3() {
  if [[ -n "$DEBUG_PORT" ]]; then
    # Electron binds remote debugging to 127.0.0.1 only.
    open -a "$APP" --args "--remote-debugging-port=$DEBUG_PORT"
  else
    open "$APP"
  fi
}

running() {
  for _ in $(seq 1 30); do
    pgrep -f "$APP/Contents/MacOS/" >/dev/null && return 0
    sleep 1
  done
  return 1
}

if [[ "$ROLLBACK_ONLY" == 1 ]]; then
  [[ -d "$ROLLBACK" ]] || fail "no rollback copy at $ROLLBACK"
  quit_t3
  rm -rf "$APP"
  mv "$ROLLBACK" "$APP"
  launch_t3
  running || fail "rolled back, but the app did not start"
  echo "install-omp-desktop: rolled back to $APP"
  exit 0
fi

repo_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || fail "working tree has uncommitted changes; commit first"

out="/tmp/t3code-release-$(date +%Y%m%d-%H%M%S)"
echo "install-omp-desktop: building $(git rev-parse --short HEAD) into $out"
build=(node scripts/build-desktop-artifact.ts --platform mac --target dir --arch arm64 --output-dir "$out")
# The 2026-11 builds needed a memory and CPU cap to keep the laptop responsive.
if command -v cpulimit >/dev/null 2>&1; then build=(cpulimit -l 35 -i -- "${build[@]}"); fi
PATH="$repo_root/node_modules/.bin:$PATH" NODE_OPTIONS=--max-old-space-size=768 UV_THREADPOOL_SIZE=1 \
  "${build[@]}"

built=$(find "$out" -maxdepth 2 -name '*.app' -type d | head -1)
[[ -n "$built" ]] || fail "build produced no .app under $out"
asar="$built/Contents/Resources/app.asar"
[[ -s "$asar" ]] || fail "build has no app.asar"
IFS=',' read -r -a markers <<<"$REQUIRE"
for marker in "${markers[@]}"; do
  [[ -z "$marker" ]] && continue
  strings -n 8 "$asar" | grep -q -- "$marker" || fail "built app.asar lacks \"$marker\""
done
echo "install-omp-desktop: build checks passed ($built)"
[[ "$BUILD_ONLY" == 1 ]] && exit 0

if [[ "$ASSUME_YES" != 1 ]]; then
  read -r -p "T3 Code will quit now, and all T3 threads will stop. Install? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || fail "cancelled"
fi

quit_t3
if [[ -d "$APP" ]]; then
  rm -rf "$ROLLBACK"
  mv "$APP" "$ROLLBACK"
fi
if ! ditto "$built" "$APP"; then
  rm -rf "$APP"
  [[ -d "$ROLLBACK" ]] && mv "$ROLLBACK" "$APP"
  fail "copy failed; the previous app is restored"
fi
launch_t3
if ! running; then
  echo "install-omp-desktop: new app did not start; rolling back" >&2
  quit_t3
  rm -rf "$APP"
  [[ -d "$ROLLBACK" ]] && mv "$ROLLBACK" "$APP" && launch_t3
  fail "install failed; rolled back"
fi
echo "install-omp-desktop: installed $(git rev-parse --short HEAD) at $APP (rollback: $ROLLBACK)"
[[ -n "$DEBUG_PORT" ]] && echo "install-omp-desktop: DevTools at http://127.0.0.1:$DEBUG_PORT"
exit 0
