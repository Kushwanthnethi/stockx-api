#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
npm run build

# Seed the bot user (idempotent)
npx ts-node prisma/seed-bot.ts
