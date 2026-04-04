#!/bin/bash

# UI Bug Detection Script
# Creates a live game and automatically detects UI bugs using Gemini

set -e

echo "🎮 Starting UI Bug Detection Pipeline"
echo "======================================"

# Create live game
echo "1️⃣ Creating live game..."
GAME_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/testing/live-game)
GAME_ID=$(echo $GAME_RESPONSE | jq -r '.gameId')
GAME_URL="http://localhost:5173/games/$GAME_ID"

if [ -z "$GAME_ID" ] || [ "$GAME_ID" = "null" ]; then
  echo "❌ Failed to create game"
  echo "Response: $GAME_RESPONSE"
  exit 1
fi

echo "✅ Game created: $GAME_ID"
echo "🌐 URL: $GAME_URL"
echo ""

# Wait for game to load and play a bit
echo "2️⃣ Waiting for game to load and start playing (5 seconds)..."
sleep 5

# Run bug detection
echo "3️⃣ Starting Gemini bug detection (capturing for 15 seconds)..."
npx ts-node src/testing/ui-bug-reporter.ts "$GAME_ID" "$GAME_URL" 15000

echo ""
echo "✅ Bug detection complete!"
echo "📁 Reports saved to: ./ui-bug-reports/"
echo "🔍 Check the markdown files for detailed bug information"
