#!/bin/bash
# =============================================================================
# DEMO CASH GAME - One command to start a live multi-player poker game
# =============================================================================
#
# Usage:
#   ./scripts/demo-cash-game.sh [num_players]
#
# Examples:
#   ./scripts/demo-cash-game.sh        # Default: 4 players
#   ./scripts/demo-cash-game.sh 6      # 6 players
#
# Requirements:
#   - Backend running on port 3000
#   - Frontend running on port 3001 (optional, for watching)
#   - PostgreSQL running
#
# =============================================================================

set -e

NUM_PLAYERS=${1:-4}
BASE_PORT=4200
API_BASE="http://localhost:3000/api/v1"
TS=$(date +%s)

echo ""
echo "🎰 DEMO CASH GAME LAUNCHER"
echo "=========================="
echo ""
echo "Players: $NUM_PLAYERS"
echo ""

# Check if backend is running
if ! curl -s "$API_BASE/games/health" > /dev/null 2>&1; then
    echo "❌ Backend not running on port 3000"
    echo "   Run: npm run dev (or node dist/src/main.js)"
    exit 1
fi
echo "✓ Backend is running"

# Kill any existing mock bot servers on our ports
for i in $(seq 1 $NUM_PLAYERS); do
    PORT=$((BASE_PORT + i))
    lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
done

# Start mock bot servers
echo ""
echo "Starting $NUM_PLAYERS mock bot servers..."
PIDS=""
for i in $(seq 1 $NUM_PLAYERS); do
    PORT=$((BASE_PORT + i))
    PORT=$PORT npx ts-node scripts/mock-bot-server.ts > /dev/null 2>&1 &
    PIDS="$PIDS $!"
    echo "  Bot $i on port $PORT"
done
sleep 2

# Find an existing table with room, or use the first available
echo ""
echo "Finding available table..."
TABLE_ID=$(curl -s "$API_BASE/games" | jq -r '[.[] | select(.status != "finished") | select(.players | length < 6)] | .[0].id // empty')

if [ -z "$TABLE_ID" ]; then
    echo "❌ No available tables found. Need admin to create one."
    echo "   Tables can be created via the admin UI or API."
    # Cleanup
    for PID in $PIDS; do kill $PID 2>/dev/null || true; done
    exit 1
fi

TABLE_NAME=$(curl -s "$API_BASE/games" | jq -r ".[] | select(.id == \"$TABLE_ID\") | .name")
echo "✓ Using table: $TABLE_NAME ($TABLE_ID)"

# Register players and join them
echo ""
echo "Registering players and joining table..."
JOINED=0

for i in $(seq 1 $NUM_PLAYERS); do
    PORT=$((BASE_PORT + i))
    EMAIL="demoplayer${i}_${TS}@demo.local"
    PASSWORD="DemoPass${i}!"
    BOT_NAME="DemoBot${i}_${TS}"
    
    # Register developer (creates user + bot in one call)
    RESP=$(curl -s -X POST "$API_BASE/auth/register-developer" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$EMAIL\",
            \"password\": \"$PASSWORD\",
            \"name\": \"Player$i\",
            \"botName\": \"$BOT_NAME\",
            \"botEndpoint\": \"http://localhost:$PORT/action\"
        }" 2>/dev/null)
    
    TOKEN=$(echo "$RESP" | jq -r '.accessToken // empty')
    BOT_ID=$(echo "$RESP" | jq -r '.bot.id // empty')
    
    if [ -n "$TOKEN" ] && [ -n "$BOT_ID" ]; then
        # Join table
        JOIN_RESP=$(curl -s -X POST "$API_BASE/games/$TABLE_ID/join" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "{\"bot_id\": \"$BOT_ID\"}" 2>/dev/null)
        
        MSG=$(echo "$JOIN_RESP" | jq -r '.message // .error // "unknown"')
        if echo "$MSG" | grep -qi "joined\|running"; then
            echo "  ✓ $BOT_NAME joined"
            JOINED=$((JOINED + 1))
        else
            echo "  ⚠ $BOT_NAME: $MSG"
        fi
    else
        ERROR=$(echo "$RESP" | jq -r '.message // "registration failed"')
        echo "  ⚠ Player $i: $ERROR"
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🎮 CASH GAME LIVE!"
echo ""
echo "   Watch at: http://localhost:3001/game/$TABLE_ID"
echo ""
echo "   Table: $TABLE_NAME"
echo "   Players joined: $JOINED"
echo "   Blinds: 25/50"
echo ""
echo "   API: curl $API_BASE/games/$TABLE_ID/state"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop the bots"
echo ""

# Keep running and show bot activity
trap "echo ''; echo 'Stopping bots...'; for PID in $PIDS; do kill \$PID 2>/dev/null || true; done; exit 0" INT

# Monitor game
while true; do
    sleep 10
    STATE=$(curl -s "$API_BASE/games/$TABLE_ID/state" 2>/dev/null)
    HAND=$(echo "$STATE" | jq -r '.handNumber // 0')
    STAGE=$(echo "$STATE" | jq -r '.stage // "unknown"')
    STATUS=$(echo "$STATE" | jq -r '.status // "unknown"')
    
    if [ "$STATUS" = "finished" ]; then
        echo ""
        echo "Game finished!"
        break
    fi
    
    echo "[$(date +%H:%M:%S)] Hand #$HAND - $STAGE ($STATUS)"
done

# Cleanup
for PID in $PIDS; do kill $PID 2>/dev/null || true; done
