#!/usr/bin/env bash
# Nativize one-shot local setup. Run from your project root AFTER you have
# a production web build in ./dist (e.g. `npm run build`).
set -euo pipefail

# CocoaPods (iOS) aborts with an Encoding::CompatibilityError unless the
# shell uses a UTF-8 locale. Export one if the environment doesn't set it.
if [ -z "${LANG:-}" ] || ! echo "${LANG:-}" | grep -qi 'utf-8\|utf8'; then
  export LANG=en_US.UTF-8
  export LC_ALL=en_US.UTF-8
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo 'Capacitor 8 requires Node.js 22 or newer.' >&2
  exit 1
fi

echo '==> Installing Capacitor 8 core + CLI + native platforms'
npm install --legacy-peer-deps @capacitor/core@^8 @capacitor/cli@^8 typescript
npm install --legacy-peer-deps @capacitor/ios@^8 @capacitor/android@^8
npm install --legacy-peer-deps @capacitor/splash-screen@^8

echo '==> Ensuring web build exists in ./dist'
if [ ! -d "dist" ]; then
  echo 'No ./dist found — running build first.'
  npm run build
fi

echo '==> Injecting selected web snippets'
bash ./nativize-inject.sh

echo '==> Adding native platforms (idempotent)'
if [ -d ios ]; then echo 'ios already added'; else npx cap add ios; fi
if [ -d android ]; then echo 'android already added'; else npx cap add android; fi

echo '==> Pinning Android toolchain (Capacitor 8 needs AGP 8.13.0 / Gradle 8.13)'
bash ./nativize-patch-android.sh

echo '==> Syncing web assets + native config'
npx cap sync


echo '==> Applying native permissions'
bash ./nativize-permissions.sh



echo '==> Done. Open native projects with:'
echo '      npx cap open ios       # needs Xcode'
echo '      npx cap open android   # needs Android Studio'
echo 'Or just push to GitHub and let .github/workflows/nativize-build.yml build in the cloud.'
