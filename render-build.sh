#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Excplicitly ensure Chrome is downloaded
# This uses the PUPPETEER_CACHE_DIR env var we set in Render
npx puppeteer browsers install chrome

npm run build
