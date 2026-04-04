import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Tournament } from "../../entities/tournament.entity";
import { Hand } from "../../entities/hand.entity";
import { HandPlayer } from "../../entities/hand-player.entity";
import { Action } from "../../entities/action.entity";
import { LogicBug } from "../../entities/logic-bug.entity";
import { ArchiveService } from "./archive.service";
import { ArchiveController } from "./archive.controller";
import { CloudStorageService } from "./cloud-storage.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, Hand, HandPlayer, Action, LogicBug]),
  ],
  controllers: [ArchiveController],
  providers: [ArchiveService, CloudStorageService],
  exports: [ArchiveService],
})
export class ArchiveModule {}
