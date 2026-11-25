#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
BUILD_DIR="$ANDROID_DIR/build"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/opt/android-sdk}}"

# Auto-detect highest installed build-tools & android platform (works locally & on GitHub Actions ubuntu-latest)
BT_VER="$(ls -1 "$SDK/build-tools" | sort -V | tail -n 1)"
PLAT_VER="$(ls -1 "$SDK/platforms" | grep '^android-' | sort -V | tail -n 1)"
BUILD_TOOLS="$SDK/build-tools/$BT_VER"
ANDROID_JAR="$SDK/platforms/$PLAT_VER/android.jar"

VERSION_NAME="${VERSION_NAME:-1.0.1}"
OUT_APK="$BUILD_DIR/AI-Model-Leaderboard-v${VERSION_NAME}.apk"
KEYSTORE="${KEYSTORE_PATH:-$HOME/.modelrank-release.jks}"

echo "Using Android SDK: $SDK (platform=$PLAT_VER, build-tools=$BT_VER)"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/res_compiled" "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex"

# 1. Generate multi-density launcher icons if Pillow is available (checked-in icons already exist)
python3 - "$ROOT_DIR/assets/site-icon.png" "$ANDROID_DIR/res" <<'PY' || true
import os, sys
try:
    from PIL import Image
except ImportError:
    sys.exit(0)
src = Image.open(sys.argv[1]).convert("RGBA")
res_dir = sys.argv[2]
for folder, size in [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
]:
    d = os.path.join(res_dir, folder)
    os.makedirs(d, exist_ok=True)
    src.resize((size, size), Image.LANCZOS).save(os.path.join(d, "ic_launcher.png"), optimize=True)
PY

# 2. Compile & link Android resources
"$BUILD_TOOLS/aapt2" compile --dir "$ANDROID_DIR/res" -o "$BUILD_DIR/res_compiled/resources.zip"
"$BUILD_TOOLS/aapt2" link \
  -o "$BUILD_DIR/app-unaligned.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$ANDROID_DIR/AndroidManifest.xml" \
  --java "$BUILD_DIR/gen" \
  "$BUILD_DIR/res_compiled/resources.zip"

# 3. Compile Java sources -> DEX
javac --release 11 \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD_DIR/classes" \
  "$BUILD_DIR/gen/com/slzx1/modelrank/R.java" \
  "$ANDROID_DIR/src/com/slzx1/modelrank/MainActivity.java"

"$BUILD_TOOLS/d8" \
  --lib "$ANDROID_JAR" \
  --min-api 24 \
  --output "$BUILD_DIR/dex" \
  $(find "$BUILD_DIR/classes" -name "*.class")

# 4. Inject classes.dex into APK & zipalign
(cd "$BUILD_DIR/dex" && zip -q -u "$BUILD_DIR/app-unaligned.apk" classes.dex)
"$BUILD_TOOLS/zipalign" -p -f 4 "$BUILD_DIR/app-unaligned.apk" "$OUT_APK"

# 5. Generate signing keystore if absent & sign APK (v2+v3)
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -storepass modelrank2026 \
    -keypass modelrank2026 \
    -alias modelrank \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=ModelRank, OU=Mobile, O=Slzx1, L=Shanghai, C=CN" >/dev/null 2>&1
fi

"$BUILD_TOOLS/apksigner" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias modelrank \
  --ks-pass pass:modelrank2026 \
  --key-pass pass:modelrank2026 \
  "$OUT_APK"

"$BUILD_TOOLS/apksigner" verify --verbose "$OUT_APK" | head -n 8
ls -lh "$OUT_APK"
