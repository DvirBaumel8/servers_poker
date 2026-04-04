import { IsEnum, IsInt, IsUUID, Max, Min } from "class-validator";
import { OpponentProfile } from "../../../entities/simulation.entity";

export { OpponentProfile };

export class CreateSimulationDto {
  @IsUUID()
  botId: string;

  @IsInt()
  @Min(1000)
  @Max(10000)
  handCount: number;

  @IsEnum(["AGGRESSIVE_SHARKS", "TIGHT_PASSIVE", "CURRENT_META"])
  opponentProfile: OpponentProfile;
}
