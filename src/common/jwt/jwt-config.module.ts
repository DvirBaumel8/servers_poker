import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Global()
@Module({
  imports: [
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
  exports: [JwtModule],
})
export class JwtConfigModule {}
