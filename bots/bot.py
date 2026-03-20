"""
Poker Engine — Python Bot Boilerplate
======================================
Copy this file, implement the `decide()` function, and deploy.

Run: python bot.py [port]
Requires: Python 3.8+, no external dependencies.

Your only job: implement decide(state) at the bottom of this file.
"""

import json
import sys
from dataclasses import dataclass, field
from enum import Enum
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import List, Optional

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3001


# ─────────────────────────────────────────────────────────────
# ENTITIES
# ─────────────────────────────────────────────────────────────

RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
}

HAND_RANKS = {
    'HIGH_CARD': 0, 'ONE_PAIR': 1, 'TWO_PAIR': 2,
    'THREE_OF_A_KIND': 3, 'STRAIGHT': 4, 'FLUSH': 5,
    'FULL_HOUSE': 6, 'FOUR_OF_A_KIND': 7,
    'STRAIGHT_FLUSH': 8, 'ROYAL_FLUSH': 9,
}


@dataclass
class Card:
    raw: str
    hidden: bool = False
    suit: str = ''
    rank: str = ''
    value: int = 0
    is_red: bool = False

    @classmethod
    def from_str(cls, s: str) -> 'Card':
        if s == '??':
            return cls(raw=s, hidden=True)
        suit = s[-1]
        rank = s[:-1]
        return cls(
            raw=s,
            suit=suit,
            rank=rank,
            value=RANK_VALUES.get(rank, 0),
            is_red=suit in ('♥', '♦'),
        )

    def __str__(self) -> str:
        return self.raw


@dataclass
class BestHand:
    name: str
    cards: List[Card]
    rank: int = 0

    @classmethod
    def from_dict(cls, d: dict) -> 'BestHand':
        obj = cls(
            name=d['name'],
            cards=[Card.from_str(c) for c in d['cards']],
        )
        obj.rank = HAND_RANKS.get(d['name'], 0)
        return obj

    def is_at_least(self, name: str) -> bool:
        return self.rank >= HAND_RANKS.get(name, 0)


@dataclass
class ActionOptions:
    can_check: bool
    to_call: int
    min_raise: int
    max_raise: int

    def pot_odds(self, pot: int) -> float:
        if self.to_call == 0:
            return 0.0
        return self.to_call / (pot + self.to_call)

    def can_raise(self) -> bool:
        return self.max_raise > 0

    def can_call(self) -> bool:
        return self.to_call > 0


@dataclass
class Player:
    name: str
    chips: int
    bet: int
    folded: bool
    all_in: bool
    position: str
    disconnected: bool

    @property
    def is_active(self) -> bool:
        return not self.folded and not self.all_in and not self.disconnected and self.chips > 0


@dataclass
class YouState:
    name: str
    chips: int
    hole_cards: List[Card]
    bet: int
    position: str
    best_hand: Optional[BestHand]

    LATE_POSITIONS = {'BTN', 'CO', 'BTN/SB'}
    BLIND_POSITIONS = {'SB', 'BB', 'BTN/SB'}

    def in_position(self) -> bool:
        return self.position in self.LATE_POSITIONS

    def is_blind(self) -> bool:
        return self.position in self.BLIND_POSITIONS

    def stack_in_bbs(self, big_blind: int) -> float:
        return self.chips / big_blind if big_blind else 0


@dataclass
class TableState:
    pot: int
    current_bet: int
    community_cards: List[Card]
    small_blind: int
    big_blind: int
    ante: int

    def has_flop(self) -> bool:
        return len(self.community_cards) >= 3

    def has_turn(self) -> bool:
        return len(self.community_cards) >= 4

    def has_river(self) -> bool:
        return len(self.community_cards) == 5


@dataclass
class GameState:
    game_id: str
    hand_number: int
    stage: str
    you: YouState
    action: ActionOptions
    table: TableState
    players: List[Player]

    def active_players(self) -> List[Player]:
        return [p for p in self.players if not p.folded and not p.disconnected]

    def opponent_count(self) -> int:
        return len([p for p in self.active_players() if p.name != self.you.name])

    def is_pre_flop(self) -> bool: return self.stage == 'pre-flop'
    def is_flop(self) -> bool:     return self.stage == 'flop'
    def is_turn(self) -> bool:     return self.stage == 'turn'
    def is_river(self) -> bool:    return self.stage == 'river'

    @classmethod
    def from_dict(cls, d: dict) -> 'GameState':
        you_d = d['you']
        tbl_d = d['table']
        act_d = d['action']
        return cls(
            game_id=d['gameId'],
            hand_number=d['handNumber'],
            stage=d['stage'],
            you=YouState(
                name=you_d['name'],
                chips=you_d['chips'],
                hole_cards=[Card.from_str(c) for c in you_d['holeCards']],
                bet=you_d['bet'],
                position=you_d['position'],
                best_hand=BestHand.from_dict(you_d['bestHand']) if you_d.get('bestHand') else None,
            ),
            action=ActionOptions(
                can_check=act_d['canCheck'],
                to_call=act_d['toCall'],
                min_raise=act_d['minRaise'],
                max_raise=act_d['maxRaise'],
            ),
            table=TableState(
                pot=tbl_d['pot'],
                current_bet=tbl_d['currentBet'],
                community_cards=[Card.from_str(c) for c in tbl_d['communityCards']],
                small_blind=tbl_d['smallBlind'],
                big_blind=tbl_d['bigBlind'],
                ante=tbl_d['ante'],
            ),
            players=[
                Player(
                    name=p['name'], chips=p['chips'], bet=p['bet'],
                    folded=p['folded'], all_in=p['allIn'],
                    position=p['position'], disconnected=p['disconnected'],
                )
                for p in d['players']
            ],
        )


# ─────────────────────────────────────────────────────────────
# ACTIONS
# ─────────────────────────────────────────────────────────────

class Action:
    @staticmethod
    def fold() -> dict:
        return {'type': 'fold'}

    @staticmethod
    def check() -> dict:
        return {'type': 'check'}

    @staticmethod
    def call() -> dict:
        return {'type': 'call'}

    @staticmethod
    def raise_by(amount: int, opts: Optional[ActionOptions] = None) -> dict:
        if opts:
            amount = max(opts.min_raise, min(amount, opts.max_raise))
        return {'type': 'raise', 'amount': int(amount)}

    @staticmethod
    def all_in(opts: ActionOptions) -> dict:
        return {'type': 'raise', 'amount': opts.max_raise}

    @staticmethod
    def pot_sized(pot: int, opts: ActionOptions) -> dict:
        return Action.raise_by(pot, opts)

    @staticmethod
    def half_pot(pot: int, opts: ActionOptions) -> dict:
        return Action.raise_by(pot // 2, opts)

    @staticmethod
    def check_or_call(opts: ActionOptions) -> dict:
        return Action.check() if opts.can_check else Action.call()


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def pot_odds(to_call: int, pot: int) -> float:
    """Fraction of total pot you need to invest. Call if equity exceeds this."""
    if to_call == 0:
        return 0.0
    return to_call / (pot + to_call)


LATE_POSITIONS = {'BTN', 'CO', 'BTN/SB'}
MID_POSITIONS  = {'HJ', 'MP', 'MP+1'}


def pre_flop_strength(hole_cards: list, position: str) -> float:
    """
    Pre-flop hand strength 0–1, adjusted for position.
    Late position widens the playable range.
    """
    if len(hole_cards) < 2 or hole_cards[0].hidden:
        return 0.1

    cards = sorted(hole_cards, key=lambda c: c.value, reverse=True)
    a, b = cards[0], cards[1]
    is_pair    = a.rank == b.rank
    is_suited  = a.suit == b.suit
    gap        = a.value - b.value
    is_broadway = a.value >= 10 and b.value >= 10
    has_ace    = a.value == 14
    in_late    = position in LATE_POSITIONS
    in_mid     = position in MID_POSITIONS

    if is_pair:
        if a.value >= 10:  score = 0.95  # JJ+
        elif a.value >= 7: score = 0.70  # 77-TT
        else:              score = 0.50  # 22-66
    elif is_broadway:
        if a.value == 14 and b.value == 13:
            score = 0.90 if is_suited else 0.85  # AK
        elif a.value == 14:
            score = 0.80 if is_suited else 0.72  # AQ, AJ, AT
        else:
            score = 0.68 if is_suited else 0.58  # KQ, KJ, QJ
    elif has_ace:
        score = 0.60 if is_suited else 0.45      # Ax suited/offsuit
    elif is_suited and gap <= 2:
        score = 0.55 if a.value >= 7 else 0.42  # suited connectors
    elif gap == 0:
        score = 0.42 if a.value >= 8 else 0.30  # offsuit connectors
    else:
        score = 0.15  # trash

    if in_late: score = min(score + 0.12, 1.0)
    elif in_mid: score = min(score + 0.06, 1.0)

    return score


def post_flop_strength(best_hand: 'BestHand | None', opponent_count: int) -> float:
    """Post-flop strength 0–1. Discounted for more opponents."""
    if best_hand is None:
        return 0.1
    base = {
        'HIGH_CARD': 0.08, 'ONE_PAIR': 0.30, 'TWO_PAIR': 0.52,
        'THREE_OF_A_KIND': 0.65, 'STRAIGHT': 0.76, 'FLUSH': 0.82,
        'FULL_HOUSE': 0.90, 'FOUR_OF_A_KIND': 0.97,
        'STRAIGHT_FLUSH': 0.99, 'ROYAL_FLUSH': 1.0,
    }.get(best_hand.name, 0.1)
    discount = max(0, (opponent_count - 1) * 0.05)
    return max(base - discount, 0.02)


def stack_bbs(chips: int, big_blind: int) -> float:
    return chips / big_blind if big_blind else 99.0


def spr(chips: int, pot: int) -> float:
    return chips / pot if pot else 99.0


def bet_size(strength: float, pot: int, opts: ActionOptions) -> dict:
    """Scale bet size with hand strength."""
    if strength >= 0.90:   fraction = 1.00
    elif strength >= 0.70: fraction = 0.75
    elif strength >= 0.55: fraction = 0.50
    else:                  fraction = 0.33
    return Action.raise_by(int(pot * fraction), opts)


# ─────────────────────────────────────────────────────────────
# YOUR STRATEGY — implement this function
# ─────────────────────────────────────────────────────────────

def decide(state: GameState) -> dict:
    """
    Your bot's decision logic. Called every time it's your turn.
    Replace or extend this with your own strategy.
    """
    you      = state.you
    action   = state.action
    table    = state.table
    opponents = state.opponent_count()
    my_bbs   = stack_bbs(you.chips, table.big_blind)

    # ── SHORT STACK: push/fold under 10BB ────────────────────
    if my_bbs < 10 and not action.can_check:
        if pre_flop_strength(you.hole_cards, you.position) >= 0.50:
            return Action.all_in(action)
        return Action.fold()

    # ── PRE-FLOP ─────────────────────────────────────────────
    if state.is_pre_flop():
        pf_str    = pre_flop_strength(you.hole_cards, you.position)
        to_call   = action.to_call
        raise_size = table.big_blind * 2.5

        if action.can_check:
            if pf_str >= 0.55:
                return Action.raise_by(int(raise_size), action)
            return Action.check()

        call_fraction = to_call / you.chips if you.chips else 1.0
        if pf_str >= 0.85:
            return Action.raise_by(to_call * 3, action)
        if pf_str >= 0.65 and call_fraction < 0.10:
            return Action.call()
        if pf_str >= 0.50 and call_fraction < 0.05 and you.in_position():
            return Action.call()
        return Action.fold()

    # ── POST-FLOP ─────────────────────────────────────────────
    strength    = post_flop_strength(you.best_hand, opponents)
    odds        = pot_odds(action.to_call, table.pot)
    current_spr = spr(you.chips, table.pot)

    if not action.can_check:
        if strength >= 0.82 and current_spr < 4 and action.can_raise():
            return Action.all_in(action)
        if strength >= 0.72 and action.can_raise() and action.to_call < you.chips * 0.25:
            return bet_size(strength, table.pot, action)
        if strength >= odds + 0.08:
            return Action.call()
        return Action.fold()

    # Can check
    if strength >= 0.55 and action.can_raise():
        if strength >= 0.65 or you.in_position():
            return bet_size(strength, table.pot, action)
    return Action.check()

# ─────────────────────────────────────────────────────────────
# SERVER — do not modify below this line
# ─────────────────────────────────────────────────────────────

class BotHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default access log

    def do_GET(self):
        if self.path == '/health':
            self._json(200, {'status': 'ok', 'bot': 'Python Boilerplate'})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/action':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body)
                state = GameState.from_dict(payload)

                print(
                    f"[Hand {state.hand_number}] {state.stage.upper()} | "
                    f"{' '.join(str(c) for c in state.you.hole_cards)} | "
                    f"Pot: {state.table.pot} | To call: {state.action.to_call}"
                    + (f" | Best: {state.you.best_hand.name}" if state.you.best_hand else "")
                )

                result = decide(state)
                print(f"  → {result['type']}" + (f" {result.get('amount')}" if 'amount' in result else ""))
                self._json(200, result)

            except Exception as e:
                print(f"[Bot error] {e}")
                self._json(200, {'type': 'fold'})
        else:
            self.send_response(404)
            self.end_headers()

    def _json(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    server = HTTPServer(('', PORT), BotHandler)
    print(f'🤖 Bot running on http://localhost:{PORT}')
    print(f'   POST /action  — receives game state, returns action')
    print(f'   GET  /health  — health check')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')
