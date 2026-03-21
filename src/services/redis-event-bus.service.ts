import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RedisPubSubService } from "../common/redis";
import { GameOwnershipService } from "./game-ownership.service";

const EVENTS_CHANNEL_PREFIX = "events:";

export interface RedisGameEvent {
  sourceInstanceId: string;
  timestamp: number;
  eventType: string;
  tableId: string;
  payload: unknown;
}

export type GameEventType =
  | "game.stateUpdated"
  | "game.handStarted"
  | "game.handComplete"
  | "game.playerAction"
  | "game.finished"
  | "game.playerRemoved"
  | "game.playerJoined"
  | "tournament.stateUpdated"
  | "tournament.levelChanged"
  | "tournament.playerBusted"
  | "tournament.tableBreak"
  | "tournament.finished";

const GAME_EVENTS: GameEventType[] = [
  "game.stateUpdated",
  "game.handStarted",
  "game.handComplete",
  "game.playerAction",
  "game.finished",
  "game.playerRemoved",
  "game.playerJoined",
  "tournament.stateUpdated",
  "tournament.levelChanged",
  "tournament.playerBusted",
  "tournament.tableBreak",
  "tournament.finished",
];

@Injectable()
export class RedisEventBusService implements OnModuleInit {
  private readonly logger = new Logger(RedisEventBusService.name);
  private readonly instanceId: string;

  constructor(
    private readonly pubSubService: RedisPubSubService,
    private readonly eventEmitter: EventEmitter2,
    private readonly ownershipService: GameOwnershipService,
  ) {
    this.instanceId = this.ownershipService.getInstanceId();
  }

  async onModuleInit(): Promise<void> {
    await this.subscribeToAllGameEvents();
    this.logger.log("RedisEventBusService initialized");
  }

  private async subscribeToAllGameEvents(): Promise<void> {
    for (const eventType of GAME_EVENTS) {
      const channel = EVENTS_CHANNEL_PREFIX + eventType;
      await this.pubSubService.subscribe(channel, (_channel, message) => {
        this.handleIncomingEvent(eventType, message);
      });
    }
    this.logger.debug(`Subscribed to ${GAME_EVENTS.length} event channels`);
  }

  private handleIncomingEvent(eventType: GameEventType, message: string): void {
    try {
      const event: RedisGameEvent = JSON.parse(message);

      if (event.sourceInstanceId === this.instanceId) {
        return;
      }

      this.logger.debug(
        `Received ${eventType} from instance ${event.sourceInstanceId.substring(0, 8)}...`,
      );

      this.eventEmitter.emit(`redis.${eventType}`, event);
    } catch (err) {
      this.logger.error(`Failed to parse event message: ${err}`);
    }
  }

  async publish(
    eventType: GameEventType,
    tableId: string,
    payload: unknown,
  ): Promise<void> {
    const channel = EVENTS_CHANNEL_PREFIX + eventType;
    const event: RedisGameEvent = {
      sourceInstanceId: this.instanceId,
      timestamp: Date.now(),
      eventType,
      tableId,
      payload,
    };

    await this.pubSubService.publish(channel, event);
    this.logger.debug(`Published ${eventType} for table ${tableId}`);
  }

  async publishTournamentEvent(
    eventType: GameEventType,
    tournamentId: string,
    payload: unknown,
  ): Promise<void> {
    const channel = EVENTS_CHANNEL_PREFIX + eventType;
    const event: RedisGameEvent = {
      sourceInstanceId: this.instanceId,
      timestamp: Date.now(),
      eventType,
      tableId: tournamentId,
      payload,
    };

    await this.pubSubService.publish(channel, event);
    this.logger.debug(`Published ${eventType} for tournament ${tournamentId}`);
  }

  onRedisEvent(
    eventType: GameEventType,
    handler: (event: RedisGameEvent) => void,
  ): void {
    this.eventEmitter.on(`redis.${eventType}`, handler);
  }

  offRedisEvent(
    eventType: GameEventType,
    handler: (event: RedisGameEvent) => void,
  ): void {
    this.eventEmitter.off(`redis.${eventType}`, handler);
  }
}
