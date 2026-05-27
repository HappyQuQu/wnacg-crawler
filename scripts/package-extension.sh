#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"
ZIP_PATH="$OUT_DIR/wnacg-downloader-extension.zip"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command is required to package the extension." >&2
  exit 1
fi

cd "$ROOT_DIR"
npm run build:extension

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

(
  cd "$ROOT_DIR/extension"
  zip -qr "$ZIP_PATH" manifest.json popup.html options.html dist
)

echo "Created $ZIP_PATH"
