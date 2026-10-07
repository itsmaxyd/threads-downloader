#!/bin/bash
# Build a signed .crx for Chrome Web Store submission when the listing has
# "Verified CRX Uploads" enabled (dashboard then rejects plain .zip uploads
# with "You must update your item with a crx package").
#
# Usage:
#   ./package-crx.sh                      # uses ./privatekey.pem
#   ./package-crx.sh /path/to/key.pem     # explicit key
#
# The private key is NEVER committed (.gitignore covers *.pem). Back it up
# in a password manager — if lost, only CWS support can rotate it (~1 week).
set -e

KEY="${1:-privatekey.pem}"
VERSION=$(grep '"version"' chrome-version/manifest.json | cut -d'"' -f4)
CRX="threads-downloader-chrome-v${VERSION}.crx"

if [ ! -f "$KEY" ]; then
  echo "ERROR: private key not found: $KEY"
  echo ""
  echo "You have two options:"
  echo "  1. Copy the original key from the other machine to ./privatekey.pem"
  echo "     (required if you want to keep uploading without CWS support)"
  echo "  2. Generate a NEW key, then ask CWS support to replace the verified"
  echo "     public key on your listing (takes up to ~1 week):"
  echo "       openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out privatekey.pem"
  echo "       openssl rsa -in privatekey.pem -pubout   # paste into dashboard"
  exit 1
fi

# Sanity checks before packing
node --check chrome-version/background.js
node --check chrome-version/content.js
node --check chrome-version/popup.js
python3 -c "import json; d=json.load(open('chrome-version/manifest.json')); assert d['manifest_version']==3, d; print('manifest MV3 OK:', d['version'])"

echo "Packing CRX with key: $KEY"
rm -f "$CRX"
google-chrome --pack-extension="$PWD/chrome-version" --pack-extension-key="$PWD/$KEY" > /dev/null 2>&1 || \
  chromium --pack-extension="$PWD/chrome-version" --pack-extension-key="$PWD/$KEY"

# Chrome writes <dirname>.crx next to the source dir; rename to versioned file
GENERATED="chrome-version.crx"
if [ -f "$GENERATED" ]; then
  mv "$GENERATED" "$CRX"
fi

if [ ! -f "$CRX" ]; then
  echo "ERROR: packing failed — no $CRX produced"
  exit 1
fi

echo "Created $CRX ($(du -h "$CRX" | cut -f1))"
echo ""
echo "Upload this file via Developer Dashboard → Package → Upload New Package."
echo "Dashboard will repackage it with Google's key; your extension ID is unchanged."
