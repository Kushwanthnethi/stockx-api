import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../services/mail.service';

@Injectable()
export class OtpService {
    private readonly logger = new Logger(OtpService.name);

    constructor(
        private prisma: PrismaService,
        private mailService: MailService
    ) { }

    async generateAndSendOtp(email: string, reason: 'signup' | 'reset' = 'signup'): Promise<void> {
        // Delete any existing OTPs for this email to prevent spam/confusion
        await this.prisma.otp.deleteMany({
            where: { email },
        });

        // Generate 6 digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // Set expiry to 10 minutes from now
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        // Save to DB
        await this.prisma.otp.create({
            data: {
                email,
                code,
                expiresAt,
            },
        });

        this.logger.log(`Generated OTP code ${code} for ${email}`);

        const title = reason === 'reset' ? 'StocksX Password Reset' : 'StocksX Security';
        const actionText = reason === 'reset' ? 'Your password reset code is:' : 'Your 6-digit verification code is:';
        const emailSubject = reason === 'reset' ? 'StocksX Password Reset Code' : 'StocksX Sign-up Verification Code';

        // Send email
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="color: #333; margin: 0;">${title}</h2>
            </div>
            <p style="color: #555; font-size: 16px;">Hello,</p>
            <p style="color: #555; font-size: 16px;">${actionText}</p>
            <div style="background-color: #f4f4f4; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
                <span style="color: #000; letter-spacing: 8px; font-size: 36px; font-weight: bold;">
                ${code}
                </span>
            </div>
            <p style="color: #777; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px; text-align: center;">If you did not request this code, please ignore this email or contact support.</p>
          </div>
        `;

        const emailSent = await this.mailService.sendEmail(
            email,
            emailSubject,
            htmlContent
        );

        if (!emailSent) {
            throw new Error('Failed to send verification email');
        }
    }

    async verifyOtp(email: string, code: string): Promise<boolean> {
        const otpRecord = await this.prisma.otp.findFirst({
            where: {
                email,
                code,
                expiresAt: {
                    gt: new Date(), // Must not be expired
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (otpRecord) {
            // Code is valid, delete it
            await this.prisma.otp.delete({
                where: { id: otpRecord.id },
            });
            return true;
        }

        return false;
    }
}
