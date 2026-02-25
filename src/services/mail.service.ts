import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);
    private resend: Resend;
    private fromEmail: string;

    constructor(private configService: ConfigService) {
        const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
        this.resend = new Resend(resendApiKey);
        this.fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL') || 'noreply@resend.dev';
    }

    async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
        try {
            const { data, error } = await this.resend.emails.send({
                from: `StocksX <${this.fromEmail}>`,
                to: [to],
                subject: subject,
                html: html,
            });

            if (error) {
                this.logger.error(`Failed to send email to ${to}: ${error.message}`);
                return false;
            }

            this.logger.log(`Email sent successfully to ${to}. ID: ${data?.id}`);
            return true;
        } catch (e) {
            this.logger.error(`Exception while sending email to ${to}: ${e.message}`);
            return false;
        }
    }

    async sendEmailWithAttachment(
        to: string,
        subject: string,
        html: string,
        attachmentBuffer: Buffer,
        filename: string,
    ): Promise<boolean> {
        try {
            const { data, error } = await this.resend.emails.send({
                from: `StocksX <${this.fromEmail}>`,
                to: [to],
                subject: subject,
                html: html,
                attachments: [
                    {
                        filename,
                        content: attachmentBuffer,
                    },
                ],
            });

            if (error) {
                this.logger.error(`Failed to send email with attachment to ${to}: ${error.message}`);
                return false;
            }

            this.logger.log(`Email with attachment sent to ${to}. ID: ${data?.id}`);
            return true;
        } catch (e) {
            this.logger.error(`Exception sending email with attachment to ${to}: ${e.message}`);
            return false;
        }
    }
}
