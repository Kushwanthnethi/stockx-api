import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { fyersModel } from 'fyers-api-v3';
import { PrismaService } from '../prisma/prisma.service';

const FYERS_TOKEN_KEY = 'fyers_access_token';

@Injectable()
export class FyersService implements OnModuleInit {
    private readonly logger = new Logger(FyersService.name);
    private accessToken: string | null = null;
    private tokenLoadedOnce = false; // Suppress repeated "expired" warnings

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
    ) { }

    async onModuleInit() {
        await this.loadTokenFromDb();
    }

    getLoginUrl(): string {
        const appId = this.configService.get<string>('FYERS_APP_ID');
        const redirectUrl = this.configService.get<string>('FYERS_REDIRECT_URL');

        return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${appId}&redirect_uri=${encodeURIComponent(
            redirectUrl || '',
        )}&response_type=code&state=stockx`;
    }

    async exchangeCodeForToken(authCode: string): Promise<string> {
        const appId = (this.configService.get<string>('FYERS_APP_ID') || '').replace(/['"]/g, '');
        const appSecret = (this.configService.get<string>('FYERS_APP_SECRET') || '').replace(/['"]/g, '');

        const fyers = new fyersModel();
        fyers.setAppId(appId);
        fyers.setRedirectUrl(this.configService.get<string>('FYERS_REDIRECT_URL') || '');

        try {
            const response = await fyers.generate_access_token({
                client_id: appId,
                secret_key: appSecret,
                auth_code: authCode,
            });

            if (response.s === 'ok' && response.access_token) {
                const token = response.access_token;
                this.accessToken = token;
                this.tokenLoadedOnce = true;
                await this.saveTokenToDb(token);
                this.logger.log('✅ Fyers token activated and saved to database.');
                return token;
            } else {
                throw new Error(response.message || 'Failed to generate access token');
            }
        } catch (error) {
            this.logger.error('Error exchanging code for token:', error.message);
            throw error;
        }
    }

    async getAccessToken(): Promise<string | null> {
        if (!this.accessToken) {
            await this.loadTokenFromDb();
        }
        return this.accessToken;
    }

    async getQuotes(symbols: string[]): Promise<any> {
        const token = await this.getAccessToken();
        if (!token) return null;

        const appId = (this.configService.get<string>('FYERS_APP_ID') || '').replace(/['"]/g, '');
        const fyers = new fyersModel();
        fyers.setAppId(appId);
        fyers.setAccessToken(token);

        try {
            const response = await fyers.getQuotes(symbols);
            return response.d || [];
        } catch (error) {
            this.logger.error(`Error fetching quotes for ${symbols.join(',')}:`, error.message);
            return null;
        }
    }

    async getHistory(symbol: string, resolution: string, from: string, to: string): Promise<any> {
        const token = await this.getAccessToken();
        if (!token) return null;

        const appId = (this.configService.get<string>('FYERS_APP_ID') || '').replace(/['"]/g, '');
        const fyers = new fyersModel();
        fyers.setAppId(appId);
        fyers.setAccessToken(token);

        try {
            const response = await fyers.getHistory({
                symbol,
                resolution,
                date_format: '1',
                range_from: from,
                range_to: to,
                cont_flag: '1',
            });
            return response.candles || [];
        } catch (error) {
            this.logger.error(`Error fetching history for ${symbol}:`, error.message);
            return null;
        }
    }

    private async saveTokenToDb(token: string) {
        try {
            const data = JSON.stringify({
                access_token: token,
                date: new Date().toISOString(),
            });
            await this.prisma.appConfig.upsert({
                where: { key: FYERS_TOKEN_KEY },
                update: { value: data },
                create: { key: FYERS_TOKEN_KEY, value: data },
            });
            this.logger.log('Fyers token persisted to database.');
        } catch (error) {
            this.logger.error('Failed to save Fyers token to database:', error.message);
        }
    }

    async clearToken() {
        this.accessToken = null;
        this.tokenLoadedOnce = false; // allow it to warn again if needed
        try {
            await this.prisma.appConfig.delete({
                where: { key: FYERS_TOKEN_KEY },
            });
            this.logger.log('Fyers token cleared from database due to invalidity/expiration.');
        } catch (error) {
            // Ignore if it's already deleted
        }
    }

    private async loadTokenFromDb() {
        try {
            const record = await this.prisma.appConfig.findUnique({
                where: { key: FYERS_TOKEN_KEY },
            });

            if (!record) {
                if (!this.tokenLoadedOnce) {
                    this.logger.warn('No Fyers token found in database. Please authenticate.');
                    this.tokenLoadedOnce = true;
                }
                return;
            }

            const data = JSON.parse(record.value);
            const tokenDate = new Date(data.date);

            // Fyers tokens expire at midnight IST. 
            // We use simple math to get the IST date string (UTC + 5 hours 30 minutes)
            const istOffsetMs = 5.5 * 60 * 60 * 1000;

            // Get YYYY-MM-DD in IST
            const getISTDateString = (dateObj: Date) => {
                const istDate = new Date(dateObj.getTime() + istOffsetMs);
                return istDate.toISOString().split('T')[0];
            };

            const tokenDayIST = getISTDateString(tokenDate);
            const nowDayIST = getISTDateString(new Date());

            if (tokenDayIST === nowDayIST) {
                this.accessToken = data.access_token;
                this.logger.log('✅ Loaded active Fyers token from database.');
            } else {
                if (!this.tokenLoadedOnce) {
                    this.logger.warn('Saved Fyers token is expired (from a previous day). Please re-authenticate.');
                    this.tokenLoadedOnce = true;
                }
                // Automatically clear the dead token from RAM so we don't try to use it
                this.accessToken = null;
            }
        } catch (error) {
            this.logger.error('Failed to load Fyers token from database:', error.message);
        }
    }
}
