import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { HandSeedRepository } from "../repositories/hand-seed.repository";

/**
 * Listens for game events and persists provably fair hand seeds to the database.
 * This allows players to verify hand fairness after the game is complete.
 */
@Injectable()
export class HandSeedPersistenceService implements OnModuleInit {
  private readonly logger = new Logger(HandSeedPersistenceService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly handSeedRepository: HandSeedRepository,
  ) {}

  onModuleInit(): void {
    this.eventEmitter.on(
      "game.handStarted",
      async (event: {
        tableId: string;
        gameId: string;
        handNumber: number;
        provablyFair?: {
          serverSeedHash: string;
          clientSeed: string;
          nonce: number;
        };
      }) => {
        if (!event.provablyFair) return;

        this.logger.debug(
          `Hand ${event.handNumber} started with provably fair commitment`,
        );
      },
    );

    this.eventEmitter.on(
      "game.handComplete",
      async (event: {
        tableId: string;
        gameId: string;
        handNumber: number;
        provablyFair?: {
          serverSeed: string;
          serverSeedHash: string;
          clientSeed: string;
          nonce: number;
          combinedHash: string;
          deckOrder: number[];
        };
      }) => {
        if (!event.provablyFair) return;

        try {
          await this.handSeedRepository.createHandSeed({
            game_id: event.gameId,
            hand_number: event.handNumber,
            server_seed: event.provablyFair.serverSeed,
            server_seed_hash: event.provablyFair.serverSeedHash,
            client_seed: event.provablyFair.clientSeed,
            combined_hash: event.provablyFair.combinedHash,
            deck_order: event.provablyFair.deckOrder,
          });

          this.logger.debug(
            `Persisted hand seed for game ${event.gameId}, hand ${event.handNumber}`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to persist hand seed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    );
  }
}
