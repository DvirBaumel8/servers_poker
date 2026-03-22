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

# Find an existing table with room, or use the first available
echo ""
echo "Finding available table..."
TABLE_ID=$(curl -s "$API_BASE/games" | jq -r '[.[] | select(.status != "finished") | select(.players | length < 6)] | .[0].id // empty')

if [ -z "$TABLE_ID" ]; then
    echo "❌ No available tables found. Need admin to create one."
    echo "   Tables can be created via the admin UI or API."
    exit 1
fi

TABLE_NAME=$(curl -s "$API_BASE/games" | jq -r ".[] | select(.id == \"$TABLE_ID\") | .name")
echo "✓ Using table: $TABLE_NAME ($TABLE_ID)"

# Register players, create bots with strategy, and join them
echo ""
echo "Registering players and joining table..."
JOINED=0

STRATEGIES=(
    '{"version":1,"tier":"quick","personality":{"aggression":55,"bluffFrequency":25,"riskTolerance":45,"tightness":55}}'
    '{"version":1,"tier":"quick","personality":{"aggression":10,"bluffFrequency":5,"riskTolerance":20,"tightness":20}}'
    '{"version":1,"tier":"quick","personality":{"aggression":90,"bluffFrequency":60,"riskTolerance":80,"tightness":30}}'
    '{"version":1,"tier":"quick","personality":{"aggression":50,"bluffFrequency":50,"riskTolerance":50,"tightness":50}}'
    '{"version":1,"tier":"quick","personality":{"aggression":5,"bluffFrequency":0,"riskTolerance":5,"tightness":95}}'
    '{"version":1,"tier":"quick","personality":{"aggression":70,"bluffFrequency":40,"riskTolerance":60,"tightness":35}}'
)

for i in $(seq 1 $NUM_PLAYERS); do
    EMAIL="demoplayer${i}_${TS}@demo.local"
    PASSWORD="DemoPass${i}!"
    BOT_NAME="DemoBot${i}_${TS}"
    STRATEGY_IDX=$(( (i - 1) % ${#STRATEGIES[@]} ))
    STRATEGY="${STRATEGIES[$STRATEGY_IDX]}"

    # Register user
    curl -s -X POST "$API_BASE/auth/register" \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"name\": \"Player$i\"}" > /dev/null 2>&1

    # Login
    LOGIN_RESP=$(curl -s -X POST "$API_BASE/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}" 2>/dev/null)

    TOKEN=$(echo "$LOGIN_RESP" | jq -r '.accessToken // empty')

    if [ -n "$TOKEN" ]; then
        # Create internal bot with strategy
        BOT_RESP=$(curl -s -X POST "$API_BASE/bots/internal" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $TOKEN" \
            -d "{\"name\": \"$BOT_NAME\", \"strategy\": $STRATEGY}" 2>/dev/null)

        BOT_ID=$(echo "$BOT_RESP" | jq -r '.id // empty')

        if [ -n "$BOT_ID" ]; then
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
            ERROR=$(echo "$BOT_RESP" | jq -r '.message // "bot creation failed"')
            echo "  ⚠ $BOT_NAME: $ERROR"
        fi
    else
        echo "  ⚠ Player $i: login failed"
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
echo "Press Ctrl+C to stop"
echo ""

trap "echo ''; echo 'Exiting...'; exit 0" INT

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
