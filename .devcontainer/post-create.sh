#!/usr/bin/env bash
# Runs once when the devcontainer is created.
set -euo pipefail

# A new named volume is created root-owned: hand it to the container user.
sudo chown node:node "$CLAUDE_CONFIG_DIR" "$HOME/.local/share/com.vercel.cli"

git config --global --add safe.directory "$PWD"

npm ci
npm install -g vercel
