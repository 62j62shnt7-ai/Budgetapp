#!/bin/bash
# Move to the project directory where this script is located
cd "$(dirname "$0")" || exit 1

echo "==========================================="
echo "   Starting Budget Control v2 (Local Dev)  "
echo "==========================================="

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install || exit 1
fi

echo "Opening http://localhost:5173 in browser..."
npm run dev -- --open
