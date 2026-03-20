import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { User } from "../../entities/user.entity";
import { Bot } from "../../entities/bot.entity";
import { UserRepository } from "../../repositories/user.repository";
import { BotRepository } from "../../repositories/bot.repository";
import { EmailService } from "../../services/email.service";
import { UrlValidatorService } from "../../common/validators/url-validator.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Bot]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>(
          "JWT_SECRET",
          "change-me-in-production",
        ),
        signOptions: {
          expiresIn: "24h" as const,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    UserRepository,
    BotRepository,
    EmailService,
    UrlValidatorService,
  ],
  exports: [AuthService, UserRepository, EmailService],
})
export class AuthModule {}
