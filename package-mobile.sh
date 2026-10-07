#!/bin/bash
# Package Firefox mobile extension (Fenix / Firefox for Android).
# Validates the MV2+gecko_android manifest before zipping so a broken
# mobile package can never ship silently again.

set -e

VERSION=$(grep '"version"' manifest.json | cut -d'"' -f4)
PACKAGE_NAME="threads-downloader-firefox-mobile-v${VERSION}.zip"

echo "Validating mobile manifest..."
python3 - <<'EOF'
import json, sys
d = json.load(open('manifest.json'))
assert d.get('manifest_version') == 2, 'Firefox Android requires MV2'
bss = d.get('browser_specific_settings', {})
assert 'gecko' in bss and 'gecko_android' in bss, 'missing gecko/gecko_android keys'
assert bss['gecko'].get('supported_on_android') is True, 'gecko.supported_on_android must be true'
dc = bss['gecko'].get('data_collection_permissions')
assert dc == {'required': ['none']}, f'invalid data_collection_permissions: {dc}'
print('manifest OK:', d['version'])
EOF

echo "Syntax-checking scripts..."
for f in background.js content.js popup.js; do node --check "$f"; done
echo "scripts OK"

# Create temp directory
TEMP_DIR=$(mktemp -d)
cp -r manifest.json background.js content.js popup.html popup.js assets "$TEMP_DIR/"

# Package
rm -f "$PACKAGE_NAME"
(cd "$TEMP_DIR" && zip -qr "$OLDPWD/$PACKAGE_NAME" .)
rm -rf "$TEMP_DIR"

echo "Created $PACKAGE_NAME"
echo "This package is optimized for Firefox for Android (Fenix)"
unzip -l "$PACKAGE_NAME"
