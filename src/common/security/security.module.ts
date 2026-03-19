import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HmacSigningService } from "./hmac-signing.service";
import { ApiKeyRotationService } from "./api-key-rotation.service";
import { WebhookSigningService } from "./webhook-signing.service";
import { User } from "../../entities/user.entity";
import { UserRepository } from "../../repositories/user.repository";

@Global()
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User])],
  providers: [
    HmacSigningService,
    ApiKeyRotationService,
    WebhookSigningService,
    UserRepository,
  ],
  exports: [HmacSigningService, ApiKeyRotationService, WebhookSigningService],
})
export class SecurityModule {}
