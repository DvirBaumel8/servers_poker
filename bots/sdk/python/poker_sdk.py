"""
Poker Engine SDK for Python
===========================

Zero-config bot creation. Just implement your strategy.

Usage:
    from poker_sdk import create_bot, Action
    
    def decide(state):
        if state.action.can_check:
            return Action.check()
        return Action.fold()
    
    create_bot(port=3001, decide=decide)
"""

import json
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import List, Optional, Callable, Dict, Any
import time

# ─────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────

RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
}

HAND_RANKS = {
    'HIGH_CARD': 0, 'ONE_PAIR': 1, 'TWO_PAIR': 2, 'THREE_OF_A_KIND': 3,
    'STRAIGHT': 4, 'FLUSH': 5, 'FULL_HOUSE': 6, 'FOUR_OF_A_KIND': 7,
    'STRAIGHT_FLUSH': 8, 'ROYAL_FLUSH': 9
}

LATE_POSITIONS = {'BTN', 'CO', 'BTN/SB'}
BLIND_POSITIONS = {'SB', 'BB', 'BTN/SB'}

# ─────────────────────────────────────────────────────────────
# CARD & HAND CLASSES
# ─────────────────────────────────────────────────────────────

@dataclass
class Card:
    raw: str
    hidden: bool = False
    suit: str = ''
    rank: str = ''
    value: int = 0
    
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
            value=RANK_VALUES.get(rank, 0)
        )
    
    def __str__(self) -> str:
        return self.raw
    
    def is_ace(self) -> bool:
        return self.value == 14
    
    def is_face(self) -> bool:
        return self.value >= 11
    
    def is_broadway(self) -> bool:
        return self.value >= 10


@dataclass
class BestHand:
    name: str
    cards: List[Card]
    rank: int = 0
    
    @classmethod
    def from_dict(cls, d: Dict) -> 'BestHand':
        obj = cls(
            name=d['name'],
            cards=[Card.from_str(c) for c in d['cards']]
        )
        obj.rank = HAND_RANKS.get(d['name'], 0)
        return obj
    
    def is_(self, name: str) -> bool:
        return self.name == name
    
    def is_at_least(self, name: str) -> bool:
        return self.rank >= HAND_RANKS.get(name, 0)
    
    def is_better_than(self, name: str) -> bool:
        return self.rank > HAND_RANKS.get(name, 0)
    
    # Quick checks
    def is_pair(self) -> bool: return self.is_('ONE_PAIR')
    def is_two_pair(self) -> bool: return self.is_('TWO_PAIR')
    def is_trips(self) -> bool: return self.is_('THREE_OF_A_KIND')
    def is_straight(self) -> bool: return self.is_('STRAIGHT')
    def is_flush(self) -> bool: return self.is_('FLUSH')
    def is_full_house(self) -> bool: return self.is_('FULL_HOUSE')
    def is_quads(self) -> bool: return self.is_('FOUR_OF_A_KIND')
    def is_monster(self) -> bool: return self.rank >= HAND_RANKS['FULL_HOUSE']
    def is_strong(self) -> bool: return self.rank >= HAND_RANKS['TWO_PAIR']


# ─────────────────────────────────────────────────────────────
# STATE CLASSES
# ─────────────────────────────────────────────────────────────

@dataclass
class ActionOptions:
    can_check: bool
    to_call: int
    min_raise: int
    max_raise: int
    
    def can_raise(self) -> bool:
        return self.max_raise > 0
    
    def pot_odds(self, pot: int) -> float:
        if self.to_call == 0:
            return 0.0
        return self.to_call / (pot + self.to_call)


@dataclass
class You:
    name: str
    chips: int
    hole_cards: List[Card]
    bet: int
    position: str
    best_hand: Optional[BestHand]
    
    def in_position(self) -> bool:
        return self.position in LATE_POSITIONS
    
    def is_blind(self) -> bool:
        return self.position in BLIND_POSITIONS
    
    def stack_in_bbs(self, big_blind: int) -> float:
        return self.chips / big_blind if big_blind else 0


@dataclass
class Table:
    pot: int
    current_bet: int
    community_cards: List[Card]
    small_blind: int
    big_blind: int
    ante: int


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
class GameState:
    game_id: str
    hand_number: int
    stage: str
    you: You
    action: ActionOptions
    table: Table
    players: List[Player]
    
    def is_pre_flop(self) -> bool: return self.stage == 'pre-flop'
    def is_flop(self) -> bool: return self.stage == 'flop'
    def is_turn(self) -> bool: return self.stage == 'turn'
    def is_river(self) -> bool: return self.stage == 'river'
    def is_post_flop(self) -> bool: return not self.is_pre_flop()
    
    def active_players(self) -> List[Player]:
        return [p for p in self.players if not p.folded and not p.disconnected]
    
    def opponent_count(self) -> int:
        return len(self.active_players())
    
    def pot_odds(self) -> float:
        return self.action.pot_odds(self.table.pot)
    
    def spr(self) -> float:
        return self.you.chips / self.table.pot if self.table.pot else 99.0
    
    @classmethod
    def from_dict(cls, d: Dict) -> 'GameState':
        you_d = d['you']
        return cls(
            game_id=d['gameId'],
            hand_number=d['handNumber'],
            stage=d['stage'],
            you=You(
                name=you_d['name'],
                chips=you_d['chips'],
                hole_cards=[Card.from_str(c) for c in you_d['holeCards']],
                bet=you_d['bet'],
                position=you_d['position'],
                best_hand=BestHand.from_dict(you_d['bestHand']) if you_d.get('bestHand') else None
            ),
            action=ActionOptions(
                can_check=d['action']['canCheck'],
                to_call=d['action']['toCall'],
                min_raise=d['action']['minRaise'],
                max_raise=d['action']['maxRaise']
            ),
            table=Table(
                pot=d['table']['pot'],
                current_bet=d['table']['currentBet'],
                community_cards=[Card.from_str(c) for c in d['table']['communityCards']],
                small_blind=d['table']['smallBlind'],
                big_blind=d['table']['bigBlind'],
                ante=d['table']['ante']
            ),
            players=[
                Player(
                    name=p['name'],
                    chips=p['chips'],
                    bet=p['bet'],
                    folded=p['folded'],
                    all_in=p['allIn'],
                    position=p['position'],
                    disconnected=p['disconnected']
                )
                for p in d['players']
            ]
        )


# ─────────────────────────────────────────────────────────────
# ACTIONS
# ─────────────────────────────────────────────────────────────

class Action:
    @staticmethod
    def fold() -> Dict:
        return {'type': 'fold'}
    
    @staticmethod
    def check() -> Dict:
        return {'type': 'check'}
    
    @staticmethod
    def call() -> Dict:
        return {'type': 'call'}
    
    @staticmethod
    def raise_by(amount: int, action: Optional[ActionOptions] = None) -> Dict:
        if action:
            amount = max(action.min_raise, min(amount, action.max_raise))
        return {'type': 'raise', 'amount': int(amount)}
    
    @staticmethod
    def all_in(action: ActionOptions) -> Dict:
        return {'type': 'raise', 'amount': action.max_raise}
    
    @staticmethod
    def pot_sized(pot: int, action: ActionOptions) -> Dict:
        return Action.raise_by(pot, action)
    
    @staticmethod
    def half_pot(pot: int, action: ActionOptions) -> Dict:
        return Action.raise_by(pot // 2, action)
    
    @staticmethod
    def third_pot(pot: int, action: ActionOptions) -> Dict:
        return Action.raise_by(pot // 3, action)
    
    @staticmethod
    def min_raise(action: ActionOptions) -> Dict:
        return Action.raise_by(action.min_raise, action)
    
    @staticmethod
    def check_or_call(action: ActionOptions) -> Dict:
        return Action.check() if action.can_check else Action.call()
    
    @staticmethod
    def check_or_fold(action: ActionOptions) -> Dict:
        return Action.check() if action.can_check else Action.fold()


# ─────────────────────────────────────────────────────────────
# STRATEGY HELPERS
# ─────────────────────────────────────────────────────────────

class Strategy:
    @staticmethod
    def pre_flop_strength(hole_cards: List[Card], position: str) -> float:
        """Pre-flop hand strength (0-1), adjusted for position."""
        if len(hole_cards) < 2 or hole_cards[0].hidden:
            return 0.1
        
        cards = sorted(hole_cards, key=lambda c: c.value, reverse=True)
        a, b = cards[0], cards[1]
        is_pair = a.rank == b.rank
        is_suited = a.suit == b.suit
        gap = a.value - b.value
        is_broadway = a.value >= 10 and b.value >= 10
        has_ace = a.value == 14
        in_late = position in LATE_POSITIONS
        
        if is_pair:
            score = 0.95 if a.value >= 10 else (0.70 if a.value >= 7 else 0.50)
        elif is_broadway:
            if a.value == 14 and b.value == 13:
                score = 0.90 if is_suited else 0.85
            elif a.value == 14:
                score = 0.80 if is_suited else 0.72
            else:
                score = 0.68 if is_suited else 0.58
        elif has_ace:
            score = 0.60 if is_suited else 0.45
        elif is_suited and gap <= 2:
            score = 0.55 if a.value >= 7 else 0.42
        elif gap == 0:
            score = 0.42 if a.value >= 8 else 0.30
        else:
            score = 0.15
        
        if in_late:
            score = min(score + 0.12, 1.0)
        
        return score
    
    @staticmethod
    def post_flop_strength(best_hand: Optional[BestHand], opponent_count: int = 1) -> float:
        """Post-flop hand strength (0-1)."""
        if best_hand is None:
            return 0.1
        base = {
            'HIGH_CARD': 0.08, 'ONE_PAIR': 0.30, 'TWO_PAIR': 0.52,
            'THREE_OF_A_KIND': 0.65, 'STRAIGHT': 0.76, 'FLUSH': 0.82,
            'FULL_HOUSE': 0.90, 'FOUR_OF_A_KIND': 0.97,
            'STRAIGHT_FLUSH': 0.99, 'ROYAL_FLUSH': 1.0
        }.get(best_hand.name, 0.1)
        discount = max(0, (opponent_count - 1) * 0.05)
        return max(base - discount, 0.02)
    
    @staticmethod
    def should_value_bet(state: GameState) -> bool:
        """Should we bet for value with this hand?"""
        if state.is_pre_flop():
            return Strategy.pre_flop_strength(state.you.hole_cards, state.you.position) >= 0.65
        return Strategy.post_flop_strength(state.you.best_hand, state.opponent_count()) >= 0.55
    
    @staticmethod
    def should_call(state: GameState, buffer: float = 0.08) -> bool:
        """Is calling profitable based on pot odds?"""
        if state.is_pre_flop():
            equity = Strategy.pre_flop_strength(state.you.hole_cards, state.you.position)
        else:
            equity = Strategy.post_flop_strength(state.you.best_hand, state.opponent_count())
        return equity >= state.pot_odds() + buffer
    
    @staticmethod
    def bet_size(strength: float, pot: int, action: ActionOptions) -> Dict:
        """Standard bet sizing based on hand strength."""
        if strength >= 0.90:
            fraction = 1.0
        elif strength >= 0.70:
            fraction = 0.75
        elif strength >= 0.55:
            fraction = 0.50
        else:
            fraction = 0.33
        return Action.raise_by(int(pot * fraction), action)


# ─────────────────────────────────────────────────────────────
# BOT SERVER
# ─────────────────────────────────────────────────────────────

def create_bot(
    port: int = 3001,
    name: str = 'PokerBot',
    decide: Callable[[GameState], Dict] = None,
    on_error: Callable[[Exception], None] = None,
    verbose: bool = True
):
    """
    Create and start a poker bot server.
    
    Args:
        port: Port to listen on (default: 3001)
        name: Bot name for health check response
        decide: Your strategy function (required)
        on_error: Error handler (default: print to stderr)
        verbose: Log each decision (default: True)
    """
    if decide is None:
        raise ValueError('decide function is required')
    
    if on_error is None:
        on_error = lambda e: print(f'[Bot error] {e}')
    
    class BotHandler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass
        
        def do_GET(self):
            if self.path == '/health':
                self._json(200, {'status': 'ok', 'bot': name})
            else:
                self.send_response(404)
                self.end_headers()
        
        def do_POST(self):
            if self.path == '/action':
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length)
                start_time = time.time()
                
                try:
                    payload = json.loads(body)
                    state = GameState.from_dict(payload)
                    
                    if verbose:
                        cards = ' '.join(str(c) for c in state.you.hole_cards)
                        best = f" | Best: {state.you.best_hand.name}" if state.you.best_hand else ""
                        print(
                            f"[Hand {state.hand_number}] {state.stage.upper()} | "
                            f"{cards} | Pot: {state.table.pot} | To call: {state.action.to_call}{best}"
                        )
                    
                    result = decide(state)
                    elapsed = int((time.time() - start_time) * 1000)
                    
                    if verbose:
                        amount = f" {result.get('amount')}" if 'amount' in result else ""
                        print(f"  → {result['type']}{amount} ({elapsed}ms)")
                    
                    self._json(200, result)
                    
                except Exception as e:
                    on_error(e)
                    self._json(200, {'type': 'fold'})
            else:
                self.send_response(404)
                self.end_headers()
        
        def _json(self, code: int, data: Dict):
            body = json.dumps(data).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
    
    print(f'🤖 {name} running on http://localhost:{port}')
    print(f'   POST /action  — receives game state, returns action')
    print(f'   GET  /health  — health check')
    
    server = HTTPServer(('', port), BotHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down.')


# ─────────────────────────────────────────────────────────────
# EXPORTS
# ─────────────────────────────────────────────────────────────

__all__ = [
    'create_bot',
    'Action',
    'Strategy',
    'GameState',
    'Card',
    'BestHand',
    'You',
    'Table',
    'Player',
    'ActionOptions',
    'HAND_RANKS',
    'RANK_VALUES',
]
