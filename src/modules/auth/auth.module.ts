import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
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
import { JwtConfigModule } from "../../common/jwt";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Bot]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtConfigModule,
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
