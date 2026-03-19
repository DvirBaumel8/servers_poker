/**
 * tables.config.js
 * ================
 * System-defined tables. Only these tables exist.
 * No user can create or modify tables — this is an operator concern.
 *
 * To add a new table: add an entry here and restart the server.
 * Existing tables with the same `id` will not be duplicated.
 */

module.exports = [
  {
    id: 'table_micro',
    name: 'Micro Stakes',
    small_blind: 5,
    big_blind: 10,
    starting_chips: 500,
    max_players: 6,
    turn_timeout_ms: 10000,
  },
  {
    id: 'table_low',
    name: 'Low Stakes',
    small_blind: 10,
    big_blind: 20,
    starting_chips: 1000,
    max_players: 6,
    turn_timeout_ms: 10000,
  },
  {
    id: 'table_mid',
    name: 'Mid Stakes',
    small_blind: 25,
    big_blind: 50,
    starting_chips: 2500,
    max_players: 9,
    turn_timeout_ms: 8000,
  },
  {
    id: 'table_high',
    name: 'High Stakes',
    small_blind: 100,
    big_blind: 200,
    starting_chips: 10000,
    max_players: 6,
    turn_timeout_ms: 8000,
  },
];
