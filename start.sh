#!/bin/sh
# Auto-healing start script for Prize Wheel Calculator
set -e

printf '\n=== Prize Wheel Calculator ===\n'

# Ensure Node.js is installed
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but not installed. Please install Node.js 18+ and rerun this script." >&2
  exit 1
fi

node_major=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$node_major" -lt 18 ]; then
  echo "Detected Node.js $(node -v). Please upgrade to version 18 or newer." >&2
  exit 1
fi

# Ensure pnpm is installed
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is not installed. Attempting to install globally via npm..." >&2
  if command -v npm >/dev/null 2>&1; then
    npm install -g pnpm
  else
    echo "npm is required to install pnpm. Please install pnpm manually." >&2
    exit 1
  fi
fi

# Install dependencies if needed
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
else
  echo "Checking dependencies..."
  pnpm install
fi

# Build the app if needed
if [ ! -d .next ]; then
  echo "Building the application..."
  pnpm run build
fi

# Start the server
echo "Starting the application..."
exec pnpm run start
