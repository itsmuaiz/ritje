#!/usr/bin/env bash
# Pin the Android toolchain to versions Capacitor 8 actually supports.
# IMPORTANT: Capacitor 8 does NOT support AGP 9. Using AGP 9 fails the build.
set -euo pipefail

if [ ! -d android ]; then
  echo 'android/ not present yet — run `npx cap add android` first.'
  exit 0
fi

AGP='8.13.0'
GRADLE='8.13'

# 1) Pin AGP in android/build.gradle
if [ -f android/build.gradle ]; then
  perl -0pi -e "s/com\\.android\\.tools\\.build:gradle:[0-9.]+/com.android.tools.build:gradle:$AGP/g" android/build.gradle || true
fi

# 2) Pin the Gradle wrapper
WRAP=android/gradle/wrapper/gradle-wrapper.properties
if [ -f "$WRAP" ]; then
  perl -0pi -e "s/gradle-[0-9.]+-(all|bin)\\.zip/gradle-$GRADLE-bin.zip/g" "$WRAP"
fi

# 3) The splash.xml duplicate-resource trap.
#    @capacitor/splash-screen and a generated splash drawable can BOTH define
#    res/drawable/splash.xml, which fails the merge with:
#      'Duplicate resources: drawable/splash.xml'.
#    De-dupe defensively: keep one copy.
SPLASH_A=android/app/src/main/res/drawable/splash.xml
SPLASH_B=android/app/src/main/res/drawable-port-mdpi/splash.xml
if [ -f "$SPLASH_A" ] && [ -f "$SPLASH_B" ]; then
  echo 'WARNING: duplicate splash.xml detected — removing the drawable-port-mdpi copy.'
  rm -f "$SPLASH_B"
fi

# 4) AdMob launch-crash guard. The Google Mobile Ads SDK (pulled in by
#    @capacitor-community/admob) CRASHES the app on startup if the manifest
#    lacks com.google.android.gms.ads.APPLICATION_ID. A fresh `cap add android`
#    never adds it, so inject Google's official TEST app id when AdMob is used.
#    >>> REPLACE the value with YOUR real AdMob App ID before release. <<<
MANIFEST=android/app/src/main/AndroidManifest.xml
if [ -f package.json ] && grep -qi 'admob' package.json && [ -f "$MANIFEST" ]; then
  if ! grep -q 'com.google.android.gms.ads.APPLICATION_ID' "$MANIFEST"; then
    echo 'AdMob detected — injecting APPLICATION_ID meta-data (TEST id; replace with yours).'
    export NZ_ADMOB_META='        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-3940256099942544~3347511713"/>'
    perl -0pi -e 's/(<activity)/$ENV{NZ_ADMOB_META}\n        $1/' "$MANIFEST"
  fi
  # The Google Mobile Ads SDK auto-init content provider (MobileAdsInitProvider)
  # crashes the app at startup whenever ad config isn't perfect. Remove it via
  # the manifest merger — the admob plugin still initializes ads on demand from JS.
  if ! grep -q 'MobileAdsInitProvider' "$MANIFEST"; then
    echo 'Removing MobileAdsInitProvider auto-init to prevent the AdMob startup crash.'
    grep -q 'xmlns:tools' "$MANIFEST" || perl -0pi -e 's/(<manifest\b)/$1 xmlns:tools="http:\/\/schemas.android.com\/tools"/' "$MANIFEST"
    export NZ_ADMOB_PROV='        <provider android:name="com.google.android.gms.ads.MobileAdsInitProvider" android:authorities="${applicationId}.mobileadsinitprovider" tools:node="remove" />'
    perl -0pi -e 's/(<activity)/$ENV{NZ_ADMOB_PROV}\n        $1/' "$MANIFEST"
  fi
fi

echo "Pinned AGP=$AGP, Gradle=$GRADLE."
