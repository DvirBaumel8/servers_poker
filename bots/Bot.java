package com.pokerengine.bot;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Poker Engine — Java Bot Boilerplate
 * =====================================
 * Single-file bot using only Java standard library (Java 11+).
 *
 * Compile: javac -d out Bot.java
 * Run:     java -cp out com.pokerengine.bot.Bot [port]
 *
 * Your only job: implement decide() at the bottom of this file.
 */
public class Bot {

    static final int DEFAULT_PORT = 3001;

    // ─────────────────────────────────────────────────────────
    // ENTITIES
    // ─────────────────────────────────────────────────────────

    static final Map<String, Integer> RANK_VALUES = new HashMap<>();
    static final Map<String, Integer> HAND_RANKS = new HashMap<>();

    static {
        String[] ranks = {"2","3","4","5","6","7","8","9","10","J","Q","K","A"};
        for (int i = 0; i < ranks.length; i++) RANK_VALUES.put(ranks[i], i + 2);

        String[] hands = {"HIGH_CARD","ONE_PAIR","TWO_PAIR","THREE_OF_A_KIND",
                          "STRAIGHT","FLUSH","FULL_HOUSE","FOUR_OF_A_KIND",
                          "STRAIGHT_FLUSH","ROYAL_FLUSH"};
        for (int i = 0; i < hands.length; i++) HAND_RANKS.put(hands[i], i);
    }

    record Card(String raw, boolean hidden, String suit, String rank, int value, boolean red) {
        static Card of(String s) {
            if ("??".equals(s)) return new Card(s, true, "", "", 0, false);
            String suit = s.substring(s.length() - 1);
            String rank = s.substring(0, s.length() - 1);
            int val = RANK_VALUES.getOrDefault(rank, 0);
            boolean red = "♥".equals(suit) || "♦".equals(suit);
            return new Card(s, false, suit, rank, val, red);
        }
        @Override public String toString() { return raw; }
    }

    record BestHand(String name, List<Card> cards, int rank) {
        static BestHand of(Map<String, Object> d) {
            String name = (String) d.get("name");
            List<String> rawCards = castList(d.get("cards"));
            List<Card> cards = rawCards.stream().map(Card::of).toList();
            int rank = HAND_RANKS.getOrDefault(name, 0);
            return new BestHand(name, cards, rank);
        }
        boolean isAtLeast(String handName) {
            return rank >= HAND_RANKS.getOrDefault(handName, 0);
        }
    }

    record ActionOptions(boolean canCheck, int toCall, int minRaise, int maxRaise) {
        double potOdds(int pot) { return toCall == 0 ? 0 : (double) toCall / (pot + toCall); }
        boolean canRaise() { return maxRaise > 0; }
        boolean canCall()  { return toCall > 0; }
    }

    record Player(String name, int chips, int bet, boolean folded,
                  boolean allIn, String position, boolean disconnected) {
        boolean isActive() { return !folded && !allIn && !disconnected && chips > 0; }
    }

    record YouState(String name, int chips, List<Card> holeCards,
                    int bet, String position, BestHand bestHand) {
        static final Set<String> LATE = Set.of("BTN", "CO", "BTN/SB");
        static final Set<String> BLIND = Set.of("SB", "BB", "BTN/SB");
        boolean inPosition()    { return LATE.contains(position); }
        boolean isBlind()       { return BLIND.contains(position); }
        double stackInBBs(int bb) { return bb == 0 ? 0 : (double) chips / bb; }
    }

    record TableState(int pot, int currentBet, List<Card> communityCards,
                      int smallBlind, int bigBlind, int ante) {
        boolean hasFlop()  { return communityCards.size() >= 3; }
        boolean hasTurn()  { return communityCards.size() >= 4; }
        boolean hasRiver() { return communityCards.size() == 5; }
    }

    record GameState(String gameId, int handNumber, String stage,
                     YouState you, ActionOptions action,
                     TableState table, List<Player> players) {

        boolean isPreFlop() { return "pre-flop".equals(stage); }
        boolean isFlop()    { return "flop".equals(stage); }
        boolean isTurn()    { return "turn".equals(stage); }
        boolean isRiver()   { return "river".equals(stage); }

        List<Player> activePlayers() {
            return players.stream().filter(Player::isActive).toList();
        }
        long opponentCount() {
            return activePlayers().stream().filter(p -> !p.name().equals(you.name())).count();
        }

        @SuppressWarnings("unchecked")
        static GameState parse(Map<String, Object> d) {
            Map<String, Object> youD   = cast(d.get("you"));
            Map<String, Object> actD   = cast(d.get("action"));
            Map<String, Object> tblD   = cast(d.get("table"));
            List<Map<String, Object>> playersD = castList(d.get("players"));

            YouState you = new YouState(
                (String) youD.get("name"),
                num(youD.get("chips")),
                castList(youD.get("holeCards")).stream().map(Card::of).toList(),
                num(youD.get("bet")),
                (String) youD.get("position"),
                youD.get("bestHand") != null ? BestHand.of(cast(youD.get("bestHand"))) : null
            );

            ActionOptions action = new ActionOptions(
                (Boolean) actD.get("canCheck"),
                num(actD.get("toCall")),
                num(actD.get("minRaise")),
                num(actD.get("maxRaise"))
            );

            TableState table = new TableState(
                num(tblD.get("pot")),
                num(tblD.get("currentBet")),
                castList(tblD.get("communityCards")).stream().map(Card::of).toList(),
                num(tblD.get("smallBlind")),
                num(tblD.get("bigBlind")),
                num(tblD.get("ante"))
            );

            List<Player> players = playersD.stream().map(p -> new Player(
                (String) p.get("name"), num(p.get("chips")), num(p.get("bet")),
                (Boolean) p.get("folded"), (Boolean) p.get("allIn"),
                (String) p.get("position"), (Boolean) p.get("disconnected")
            )).toList();

            return new GameState(
                (String) d.get("gameId"), num(d.get("handNumber")),
                (String) d.get("stage"), you, action, table, players
            );
        }
    }

    // ─────────────────────────────────────────────────────────
    // ACTIONS
    // ─────────────────────────────────────────────────────────

    static Map<String, Object> fold()  { return Map.of("type", "fold"); }
    static Map<String, Object> check() { return Map.of("type", "check"); }
    static Map<String, Object> call()  { return Map.of("type", "call"); }

    static Map<String, Object> raiseBy(int amount, ActionOptions opts) {
        int clamped = Math.min(Math.max(amount, opts.minRaise()), opts.maxRaise());
        return Map.of("type", "raise", "amount", clamped);
    }

    static Map<String, Object> allIn(ActionOptions opts) {
        return Map.of("type", "raise", "amount", opts.maxRaise());
    }

    static Map<String, Object> halfPot(int pot, ActionOptions opts) {
        return raiseBy(pot / 2, opts);
    }

    static Map<String, Object> checkOrCall(ActionOptions opts) {
        return opts.canCheck() ? check() : call();
    }

    // ─────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────

    static final Set<String> LATE_POS = Set.of("BTN", "CO", "BTN/SB");
    static final Set<String> MID_POS  = Set.of("HJ", "MP", "MP+1");

    static double potOdds(int toCall, int pot) {
        return toCall == 0 ? 0 : (double) toCall / (pot + toCall);
    }

    static double preFlopStrength(List<Card> holeCards, String position) {
        if (holeCards.size() < 2 || holeCards.get(0).hidden()) return 0.1;
        List<Card> sorted = new ArrayList<>(holeCards);
        sorted.sort((x, y) -> y.value() - x.value());
        Card a = sorted.get(0), b = sorted.get(1);
        boolean isPair    = a.rank().equals(b.rank());
        boolean isSuited  = a.suit().equals(b.suit());
        int gap           = a.value() - b.value();
        boolean broadway  = a.value() >= 10 && b.value() >= 10;
        boolean hasAce    = a.value() == 14;
        boolean inLate    = LATE_POS.contains(position);
        boolean inMid     = MID_POS.contains(position);
        double score;
        if (isPair) {
            score = a.value() >= 10 ? 0.95 : a.value() >= 7 ? 0.70 : 0.50;
        } else if (broadway) {
            if (a.value() == 14 && b.value() == 13) score = isSuited ? 0.90 : 0.85;
            else if (a.value() == 14)               score = isSuited ? 0.80 : 0.72;
            else                                     score = isSuited ? 0.68 : 0.58;
        } else if (hasAce) {
            score = isSuited ? 0.60 : 0.45;
        } else if (isSuited && gap <= 2) {
            score = a.value() >= 7 ? 0.55 : 0.42;
        } else if (gap == 0) {
            score = a.value() >= 8 ? 0.42 : 0.30;
        } else {
            score = 0.15;
        }
        if (inLate)     score = Math.min(score + 0.12, 1.0);
        else if (inMid) score = Math.min(score + 0.06, 1.0);
        return score;
    }

    static double postFlopStrength(BestHand hand, long opponentCount) {
        if (hand == null) return 0.1;
        double base = switch (hand.name()) {
            case "HIGH_CARD"       -> 0.08;
            case "ONE_PAIR"        -> 0.30;
            case "TWO_PAIR"        -> 0.52;
            case "THREE_OF_A_KIND" -> 0.65;
            case "STRAIGHT"        -> 0.76;
            case "FLUSH"           -> 0.82;
            case "FULL_HOUSE"      -> 0.90;
            case "FOUR_OF_A_KIND"  -> 0.97;
            case "STRAIGHT_FLUSH"  -> 0.99;
            case "ROYAL_FLUSH"     -> 1.00;
            default                -> 0.10;
        };
        return Math.max(base - Math.max(0, (opponentCount - 1) * 0.05), 0.02);
    }

    static double stackBBs(int chips, int bigBlind) {
        return bigBlind > 0 ? (double) chips / bigBlind : 99;
    }

    static double spr(int chips, int pot) {
        return pot > 0 ? (double) chips / pot : 99;
    }

    static Map<String, Object> betSize(double strength, int pot, ActionOptions opts) {
        double fraction = strength >= 0.90 ? 1.00
                        : strength >= 0.70 ? 0.75
                        : strength >= 0.55 ? 0.50
                        : 0.33;
        return raiseBy((int)(pot * fraction), opts);
    }
    // ─────────────────────────────────────────────────────────
    // YOUR STRATEGY — implement this method
    // ─────────────────────────────────────────────────────────

    /**
     * Your bot's decision logic. Replace or extend this with your own strategy.
     */
    static Map<String, Object> decide(GameState state) {
        YouState     you      = state.you();
        ActionOptions action  = state.action();
        TableState   table    = state.table();
        long         opps     = state.opponentCount();
        double       myBBs    = stackBBs(you.chips(), table.bigBlind());

        // ── SHORT STACK: push/fold under 10BB ──────────────
        if (myBBs < 10 && !action.canCheck()) {
            if (preFlopStrength(you.holeCards(), you.position()) >= 0.50)
                return allIn(action);
            return fold();
        }

        // ── PRE-FLOP ───────────────────────────────────────
        if (state.isPreFlop()) {
            double pfStr     = preFlopStrength(you.holeCards(), you.position());
            int    toCall    = action.toCall();
            int    raiseSize = (int)(table.bigBlind() * 2.5);

            if (action.canCheck()) {
                return pfStr >= 0.55 ? raiseBy(raiseSize, action) : check();
            }
            double callFraction = you.chips() > 0 ? (double) toCall / you.chips() : 1.0;
            if (pfStr >= 0.85)                                    return raiseBy(toCall * 3, action);
            if (pfStr >= 0.65 && callFraction < 0.10)            return call();
            if (pfStr >= 0.50 && callFraction < 0.05 && YouState.LATE.contains(you.position())) return call();
            return fold();
        }

        // ── POST-FLOP ──────────────────────────────────────
        double strength    = postFlopStrength(you.bestHand(), opps);
        double odds        = potOdds(action.toCall(), table.pot());
        double currentSpr  = spr(you.chips(), table.pot());

        if (!action.canCheck()) {
            if (strength >= 0.82 && currentSpr < 4 && action.canRaise())
                return allIn(action);
            if (strength >= 0.72 && action.canRaise() && action.toCall() < you.chips() * 0.25)
                return betSize(strength, table.pot(), action);
            if (strength >= odds + 0.08)
                return call();
            return fold();
        }

        // Can check
        if (strength >= 0.55 && action.canRaise()) {
            if (strength >= 0.65 || YouState.LATE.contains(you.position()))
                return betSize(strength, table.pot(), action);
        }
        return check();
    }
    // ─────────────────────────────────────────────────────────
    // SERVER — do not modify below this line
    // ─────────────────────────────────────────────────────────

    public static void main(String[] args) throws IOException {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : DEFAULT_PORT;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        server.createContext("/health", ex -> {
            respond(ex, 200, "{\"status\":\"ok\",\"bot\":\"Java Boilerplate\"}");
        });

        server.createContext("/action", ex -> {
            if (!"POST".equals(ex.getRequestMethod())) {
                ex.sendResponseHeaders(405, 0);
                ex.close();
                return;
            }
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            try {
                Map<String, Object> payload = parseJson(body);
                GameState state = GameState.parse(payload);

                System.out.printf("[Hand %d] %s | %s | Pot: %d | To call: %d%s%n",
                    state.handNumber(), state.stage().toUpperCase(),
                    state.you().holeCards().stream().map(Card::toString).reduce((a,b)->a+" "+b).orElse(""),
                    state.table().pot(), state.action().toCall(),
                    state.you().bestHand() != null ? " | Best: " + state.you().bestHand().name() : ""
                );

                Map<String, Object> result = decide(state);
                System.out.printf("  → %s%s%n", result.get("type"),
                    result.containsKey("amount") ? " " + result.get("amount") : "");

                respond(ex, 200, toJson(result));
            } catch (Exception e) {
                System.err.println("[Bot error] " + e.getMessage());
                respond(ex, 200, "{\"type\":\"fold\"}");
            }
        });

        server.start();
        System.out.printf("🤖 Bot running on http://localhost:%d%n", port);
        System.out.println("   POST /action  — receives game state, returns action");
        System.out.println("   GET  /health  — health check");
    }

    // ─────────────────────────────────────────────────────────
    // MINIMAL JSON — no external dependencies
    // ─────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    static Map<String, Object> parseJson(String json) {
        return (Map<String, Object>) parseValue(json.trim(), new int[]{0});
    }

    static Object parseValue(String s, int[] pos) {
        skipWhitespace(s, pos);
        char c = s.charAt(pos[0]);
        if (c == '{') return parseObject(s, pos);
        if (c == '[') return parseArray(s, pos);
        if (c == '"') return parseString(s, pos);
        if (c == 't') { pos[0] += 4; return true; }
        if (c == 'f') { pos[0] += 5; return false; }
        if (c == 'n') { pos[0] += 4; return null; }
        return parseNumber(s, pos);
    }

    static Map<String, Object> parseObject(String s, int[] pos) {
        Map<String, Object> map = new LinkedHashMap<>();
        pos[0]++; // {
        skipWhitespace(s, pos);
        if (s.charAt(pos[0]) == '}') { pos[0]++; return map; }
        while (true) {
            skipWhitespace(s, pos);
            String key = parseString(s, pos);
            skipWhitespace(s, pos); pos[0]++; // :
            Object val = parseValue(s, pos);
            map.put(key, val);
            skipWhitespace(s, pos);
            char next = s.charAt(pos[0]++);
            if (next == '}') break;
        }
        return map;
    }

    static List<Object> parseArray(String s, int[] pos) {
        List<Object> list = new ArrayList<>();
        pos[0]++; // [
        skipWhitespace(s, pos);
        if (s.charAt(pos[0]) == ']') { pos[0]++; return list; }
        while (true) {
            list.add(parseValue(s, pos));
            skipWhitespace(s, pos);
            char next = s.charAt(pos[0]++);
            if (next == ']') break;
        }
        return list;
    }

    static String parseString(String s, int[] pos) {
        pos[0]++; // opening "
        StringBuilder sb = new StringBuilder();
        while (pos[0] < s.length()) {
            char c = s.charAt(pos[0]++);
            if (c == '"') break;
            if (c == '\\') {
                char esc = s.charAt(pos[0]++);
                sb.append(switch (esc) {
                    case 'n' -> '\n'; case 't' -> '\t'; case 'r' -> '\r';
                    default -> esc;
                });
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    static Object parseNumber(String s, int[] pos) {
        int start = pos[0];
        while (pos[0] < s.length() && "0123456789.-+eE".indexOf(s.charAt(pos[0])) >= 0) pos[0]++;
        String num = s.substring(start, pos[0]);
        try { return Integer.parseInt(num); } catch (NumberFormatException ignored) {}
        return Double.parseDouble(num);
    }

    static void skipWhitespace(String s, int[] pos) {
        while (pos[0] < s.length() && Character.isWhitespace(s.charAt(pos[0]))) pos[0]++;
    }

    static String toJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(',');
            sb.append('"').append(e.getKey()).append("\":");
            Object v = e.getValue();
            if (v instanceof String) sb.append('"').append(v).append('"');
            else sb.append(v);
            first = false;
        }
        return sb.append('}').toString();
    }

    static void respond(HttpExchange ex, int code, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
        ex.sendResponseHeaders(code, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    // ─────────────────────────────────────────────────────────
    // CAST HELPERS
    // ─────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    static <T> T cast(Object o) { return (T) o; }

    @SuppressWarnings("unchecked")
    static <T> List<T> castList(Object o) {
        if (o == null) return List.of();
        return (List<T>) o;
    }

    static int num(Object o) {
        if (o instanceof Integer i) return i;
        if (o instanceof Double d) return d.intValue();
        if (o instanceof Long l) return l.intValue();
        return 0;
    }
}
