#!/bin/bash

# Watch Live Game - Start everything and view a live poker game
# Usage: npm run game:watch

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🎮 Starting Live Poker Game..."
echo ""

# Kill any existing processes
pkill -f "nest start" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2

# Start backend
echo "🔧 Starting backend..."
npm run dev > /tmp/poker-backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

# Start frontend
echo "🌐 Starting frontend..."
cd "$PROJECT_ROOT/frontend"
npm run dev > /tmp/poker-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"
cd "$PROJECT_ROOT"

# Wait for servers to be ready
echo "⏳ Waiting for servers to start..."
sleep 10

# Test backend
if ! curl -s http://localhost:3000/api/v1/games/health > /dev/null; then
  echo "❌ Backend failed to start"
  tail -20 /tmp/poker-backend.log
  exit 1
fi

echo "✅ Backend ready"

# Start live game via HTTP API
echo "🎯 Starting live game with bots..."
GAME_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/testing/live-game \
  -H "Content-Type: application/json" \
  -d '{}')

GAME_ID=$(echo "$GAME_RESPONSE" | grep -o '"gameId":"[^"]*' | cut -d'"' -f4)

if [ -z "$GAME_ID" ]; then
  echo "❌ Failed to create game"
  echo "Response: $GAME_RESPONSE"
  tail -20 /tmp/poker-backend.log
  exit 1
fi

GAME_URL="http://localhost:5173/games/$GAME_ID"

echo ""
echo "✅ Servers running!"
echo ""
echo "🔗 Backend: http://localhost:3000"
echo "⚛️  Frontend: http://localhost:5173"
echo ""
echo "🎮 LIVE GAME STARTED!"
echo "   Game ID: $GAME_ID"
echo "   URL: $GAME_URL"
echo ""
echo "⚠️  If you're on macOS, we'll try to open it in Chrome..."
if command -v open &> /dev/null; then
  open -a "Google Chrome" "$GAME_URL" 2>/dev/null || open -a "Chrome" "$GAME_URL" 2>/dev/null || true
fi
echo ""
echo "Otherwise, open this URL manually: $GAME_URL"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Keep script running
wait

