#!/bin/zsh
# Build, test and screenshot the native iOS app on a Mac (Xcode + XcodeGen).
#
#   scripts/mac-build.sh build [iphone|ipad]       generate the project + build for the simulator
#   scripts/mac-build.sh test                      swift test on NeuroPalCore (macOS, no simulator)
#   scripts/mac-build.sh shot <name> [iphone|ipad] [launch args…]
#                                                  install the last build, launch it, screenshot
#   scripts/mac-build.sh ui-test [iphone|ipad]     run the UI tests (accessibility audits)
#
# Every Xcode/simulator step takes one machine-wide lock, so several
# checkouts can share one Mac without builds fighting over memory or the
# simulators. Env: NP_DERIVED (DerivedData dir; default ../.dd-<checkout>),
# NP_SHOTS (screenshot dir; default ~/Developer/neuropal-agents/shots/<checkout>),
# NP_APPEARANCE (light|dark simulator appearance, default dark),
# NP_TEXT_SIZE (simulator Dynamic Type, e.g. accessibility-extra-large).
set -euo pipefail

HERE="${0:A:h}"
IOS="${HERE:h}"
CHECKOUT="${IOS:h}"
NAME="${CHECKOUT:t}"
LOCK=/tmp/neuropal-xcode.lock
DERIVED="${NP_DERIVED:-${CHECKOUT:h}/.dd-${NAME}}"
SHOTS="${NP_SHOTS:-$HOME/Developer/neuropal-agents/shots/${NAME}}"
# iOS 26.5 simulators (xcrun simctl list devices)
IPHONE_ID="${NP_IPHONE_ID:-2D328DA9-60AD-4F27-A488-A0ED4AFD21B5}"   # iPhone 17 Pro
IPAD_ID="${NP_IPAD_ID:-C028B4BB-06F8-4E8C-9996-498FC254EFE4}"       # iPad Pro 13-inch (M5)
BUNDLE=io.neuropal.ios

device() { [[ "${1:-iphone}" == ipad ]] && echo "$IPAD_ID" || echo "$IPHONE_ID"; }

locked() { /usr/bin/lockf -t 3600 "$LOCK" "$@"; }

boot() {
  local id="$1"
  xcrun simctl boot "$id" 2>/dev/null || true
  xcrun simctl bootstatus "$id" -b >/dev/null
  xcrun simctl ui "$id" appearance "${NP_APPEARANCE:-dark}" || true
  if [[ -n "${NP_TEXT_SIZE:-}" ]]; then xcrun simctl ui "$id" content_size "$NP_TEXT_SIZE" || true; fi
  xcrun simctl status_bar "$id" override --time 9:41 --dataNetwork wifi --wifiBars 3 \
    --batteryState charged --batteryLevel 100 >/dev/null 2>&1 || true
}

app_path() {
  echo "$DERIVED/Build/Products/Debug-iphonesimulator/NeuroPal.app"
}

do_build() {
  local id; id=$(device "${1:-iphone}")
  cd "$IOS"
  xcodegen generate --quiet
  # Ad-hoc ("-") signing embeds the entitlements, so the App Group works in
  # the simulator; no Apple team needed.
  set +e
  xcodebuild -project NeuroPal.xcodeproj -scheme NeuroPal -configuration Debug \
    -destination "platform=iOS Simulator,id=$id" -derivedDataPath "$DERIVED" \
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
    build > "$DERIVED.build.log" 2>&1
  local rc=$?
  set -e
  # Errors and warnings from our own sources, then the verdict.
  grep -E "(error|warning): " "$DERIVED.build.log" | grep -v "/DerivedData/\|SourcePackages/checkouts" \
    | sed "s|$CHECKOUT/||" | sort -u | head -80 || true
  if [[ $rc -eq 0 ]]; then echo "BUILD OK ($NAME, $(app_path))"; else
    tail -25 "$DERIVED.build.log"; echo "BUILD FAILED ($NAME) — full log: $DERIVED.build.log"; fi
  return $rc
}

do_test() {
  cd "$IOS/Packages/NeuroPalCore"
  swift test --scratch-path "$DERIVED-core" 2>&1 | grep -vE "^\[[0-9]+/[0-9]+\] (Compiling|Emitting|Linking|Write|Build|Planning)" | tail -60
  return ${pipestatus[1]}
}

do_shot() {
  local name="$1"; shift
  local which="iphone"
  if [[ "${1:-}" == iphone || "${1:-}" == ipad ]]; then which="$1"; shift; fi
  local id; id=$(device "$which")
  mkdir -p "$SHOTS"
  boot "$id"
  xcrun simctl terminate "$id" "$BUNDLE" 2>/dev/null || true
  # A freshly booted simulator sometimes refuses the first install.
  xcrun simctl install "$id" "$(app_path)" 2>/dev/null || { sleep 5; xcrun simctl install "$id" "$(app_path)"; }
  xcrun simctl launch "$id" "$BUNDLE" "$@" >/dev/null
  sleep "${NP_SHOT_WAIT:-4}"
  local out="$SHOTS/${name}-${which}.png"
  xcrun simctl io "$id" screenshot --type=png "$out" >/dev/null 2>&1
  # A smaller copy for reading back (the full iPad shot is ~2048×2732).
  sips -Z 1400 "$out" --out "${out%.png}.small.png" >/dev/null
  echo "SHOT $out"
}

do_ui_test() {
  local id; id=$(device "${1:-iphone}")
  cd "$IOS"
  xcodegen generate --quiet
  set +e
  xcodebuild -project NeuroPal.xcodeproj -scheme NeuroPal -configuration Debug \
    -destination "platform=iOS Simulator,id=$id" -derivedDataPath "$DERIVED" \
    CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= \
    test > "$DERIVED.uitest.log" 2>&1
  local rc=$?
  set -e
  grep -E "Test Case|error:|failed|passed|Executed" "$DERIVED.uitest.log" | tail -60 || true
  return $rc
}

cmd="${1:-build}"; shift || true
case "$cmd" in
  build) locked "$0" __build "$@" ;;
  test) locked "$0" __test "$@" ;;
  shot) locked "$0" __shot "$@" ;;
  ui-test) locked "$0" __ui_test "$@" ;;
  __build) do_build "$@" ;;
  __test) do_test "$@" ;;
  __shot) do_shot "$@" ;;
  __ui_test) do_ui_test "$@" ;;
  *) echo "usage: $0 build|test|shot|ui-test …" >&2; exit 2 ;;
esac
