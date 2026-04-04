import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Simulation } from "../../entities/simulation.entity";
import { SimulationResult } from "../../entities/simulation-result.entity";
import { Bot } from "../../entities/bot.entity";
import { BotRepository } from "../../repositories/bot.repository";
import { SimulationRepository } from "../../repositories/simulation.repository";
import { SimulationsController } from "./simulations.controller";
import { SimulationsService } from "./simulations.service";

@Module({
  imports: [TypeOrmModule.forFeature([Simulation, SimulationResult, Bot])],
  controllers: [SimulationsController],
  providers: [SimulationsService, SimulationRepository, BotRepository],
})
export class SimulationsModule {}
