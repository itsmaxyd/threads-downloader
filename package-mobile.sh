#!/bin/bash

# Package Firefox mobile extension
# This creates a separate package for Firefox Android

VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
PACKAGE_NAME="threads-downloader-firefox-mobile-v${VERSION}.zip"

# Create temp directory
TEMP_DIR=$(mktemp -d)
cp -r manifest.json background.js content.js popup.html popup.js assets $TEMP_DIR/

# Package
cd $TEMP_DIR
zip -r $OLDPWD/$PACKAGE_NAME *
cd $OLDPWD
rm -rf $TEMP_DIR

echo "Created $PACKAGE_NAME"
echo "This package is optimized for Firefox for Android (Fenix)"
