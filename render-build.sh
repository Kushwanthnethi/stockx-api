#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
npm run build

# Store/Install Chrome in a specific cache directory
# Puppeteer will download Chrome to ~/.cache/puppeteer by default during npm install
# We just need to ensure dependencies are met.
# But Render native node might lack libs.
# If this fails, we strongly suggest Docker.
