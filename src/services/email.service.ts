import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const smtpHost = this.configService.get<string>("SMTP_HOST");
    const smtpPort = this.configService.get<number>("SMTP_PORT", 587);
    const smtpUser = this.configService.get<string>("SMTP_USER");
    const smtpPass = this.configService.get<string>("SMTP_PASS");

    this.isEnabled = !!(smtpHost && smtpUser && smtpPass);

    if (this.isEnabled) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log("Email service initialized with SMTP");
    } else {
      this.logger.warn(
        "Email service running in development mode (emails will be logged, not sent)",
      );
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    const fromEmail = this.configService.get<string>(
      "EMAIL_FROM",
      "noreply@poker-platform.com",
    );

    if (!this.isEnabled || !this.transporter) {
      this.logger.log(`[DEV MODE] Email to ${options.to}:`);
      this.logger.log(`  Subject: ${options.subject}`);
      this.logger.log(`  Body: ${options.text}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<boolean> {
    const appName = this.configService.get<string>(
      "APP_NAME",
      "Poker Platform",
    );

    return this.sendEmail({
      to: email,
      subject: `${appName} - Email Verification Code`,
      text: `Your verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this code, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a2e; text-align: center;">Email Verification</h1>
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px; text-align: center;">
            <p style="color: #9ca3af; margin-bottom: 20px;">Your verification code is:</p>
            <div style="background: #0f0f1a; padding: 20px; border-radius: 8px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; color: #fbbf24; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="color: #6b7280; margin-top: 20px; font-size: 14px;">
              This code will expire in 10 minutes.
            </p>
          </div>
          <p style="color: #6b7280; text-align: center; margin-top: 20px; font-size: 12px;">
            If you did not request this code, please ignore this email.
          </p>
        </div>
      `,
    });
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const appName = this.configService.get<string>(
      "APP_NAME",
      "Poker Platform",
    );

    return this.sendEmail({
      to: email,
      subject: `Welcome to ${appName}!`,
      text: `Hi ${name},\n\nWelcome to ${appName}! Your account has been verified and is ready to use.\n\nGet started by creating your first bot and joining a tournament.\n\nGood luck at the tables!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a2e; text-align: center;">Welcome to ${appName}!</h1>
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px;">
            <p style="color: #ffffff; font-size: 18px;">Hi ${name},</p>
            <p style="color: #9ca3af;">Your account has been verified and is ready to use.</p>
            <p style="color: #9ca3af;">Get started by:</p>
            <ul style="color: #9ca3af;">
              <li>Creating your first bot</li>
              <li>Joining a cash game table</li>
              <li>Registering for a tournament</li>
            </ul>
            <p style="color: #fbbf24; font-weight: bold; margin-top: 20px;">Good luck at the tables!</p>
          </div>
        </div>
      `,
    });
  }

  async sendPasswordResetCode(email: string, code: string): Promise<boolean> {
    const appName = this.configService.get<string>(
      "APP_NAME",
      "Poker Platform",
    );

    return this.sendEmail({
      to: email,
      subject: `${appName} - Password Reset Code`,
      text: `Your password reset code is: ${code}\n\nThis code will expire in 15 minutes.\n\nIf you did not request this code, please ignore this email and your password will remain unchanged.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a2e; text-align: center;">Password Reset</h1>
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 10px; text-align: center;">
            <p style="color: #9ca3af; margin-bottom: 20px;">Your password reset code is:</p>
            <div style="background: #0f0f1a; padding: 20px; border-radius: 8px; display: inline-block;">
              <span style="font-size: 32px; font-weight: bold; color: #fbbf24; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="color: #6b7280; margin-top: 20px; font-size: 14px;">
              This code will expire in 15 minutes.
            </p>
          </div>
          <p style="color: #6b7280; text-align: center; margin-top: 20px; font-size: 12px;">
            If you did not request this code, please ignore this email and your password will remain unchanged.
          </p>
        </div>
      `,
    });
  }

  generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
