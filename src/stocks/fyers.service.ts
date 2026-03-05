import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { fyersModel } from 'fyers-api-v3';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FyersService implements OnModuleInit {
    private readonly logger = new Logger(FyersService.name);
    private accessToken: string | null = null;
    private tokenLoadedOnce = false; // Suppress repeated "expired" warnings
    private readonly tokenKey: string;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
    ) {
        // Isolate tokens by environment to prevent "Token War" deletions
        this.tokenKey = process.env.RENDER === 'true' ? 'fyers_token_prod' : 'fyers_token_local';
        this.logger.log(`FyersService Initialized. Key: ${this.tokenKey}. Build: v6-force-https`);
    }

    async onModuleInit() {
        await this.loadTokenFromDb();
    }

    getLoginUrl(): string {
        const appId = this.configService.get<string>('FYERS_APP_ID')?.trim();
        let redirectUrl = this.configService.get<string>('FYERS_REDIRECT_URL')?.trim();

        // Force HTTPS on Render to prevent redirectUrl mismatch
        if (process.env.RENDER === 'true' && redirectUrl?.startsWith('http://')) {
            redirectUrl = redirectUrl.replace('http://', 'https://');
        }

        return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${appId}&redirect_uri=${encodeURIComponent(
            redirectUrl || '',
        )}&response_type=code&state=stockx`;
    }

    async exchangeCodeForToken(authCode: string): Promise<string> {
        const appId = (this.configService.get<string>('FYERS_APP_ID') || '').replace(/['"]/g, '').trim();
        const appSecret = (this.configService.get<string>('FYERS_APP_SECRET') || '').replace(/['"]/g, '').trim();
        let redirectUrl = this.configService.get<string>('FYERS_REDIRECT_URL')?.trim() || '';

        // Force HTTPS on Render to match dashboard settings
        if (process.env.RENDER === 'true' && redirectUrl.startsWith('http://')) {
            redirectUrl = redirectUrl.replace('http://', 'https://');
        }

        const fyers = new fyersModel();
        fyers.setAppId(appId);
        fyers.setRedirectUrl(redirectUrl);

        try {
            this.logger.log(`Exchanging code for token with appId: ${appId} and redirect: ${redirectUrl}`);
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
                this.logger.error('Fyers token exchange failed. Response:', JSON.stringify(response));
                const errorMsg = response.message || response.err_msg || 'Failed to generate access token';
                throw new Error(errorMsg);
            }
        } catch (error) {
            this.logger.error('Error in exchangeCodeForToken:', error.message);
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

        const appId = (this.configService.get<string>('FYERS_APP_ID') || '').replace(/['"]/g, '').trim();
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

        const appId = (this.configService.get<string>('FYERS_APP_ID') || '').replace(/['"]/g, '').trim();
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
                where: { key: this.tokenKey },
                update: { value: data },
                create: { key: this.tokenKey, value: data },
            });
            this.logger.log(`Fyers token successfully persisted to database with key: ${this.tokenKey}`);
        } catch (error) {
            this.logger.error('Failed to save Fyers token to database:', error.message);
        }
    }

    async clearToken(failedToken?: string) {
        this.accessToken = null;
        this.tokenLoadedOnce = false;

        try {
            if (failedToken) {
                // Peek at DB to see if it's the same token before deleting
                const record = await this.prisma.appConfig.findUnique({
                    where: { key: this.tokenKey },
                });

                if (record) {
                    const data = JSON.parse(record.value);
                    if (data.access_token !== failedToken) {
                        this.logger.log(`Skipping clearToken: DB already has a DIFFERENT (potentially newer) token.`);
                        return;
                    }
                }
            }

            this.logger.warn(`CRITICAL: clearToken() confirmed. Deleting ${this.tokenKey} from DB.`);
            await this.prisma.appConfig.delete({
                where: { key: this.tokenKey },
            });
            this.logger.warn(`Successfully deleted ${this.tokenKey} from database.`);
        } catch (error) {
            this.logger.debug(`clearToken() failed (likely record already gone): ${error.message}`);
        }
    }

    private async loadTokenFromDb() {
        try {
            this.logger.log(`Checking for Fyers token in DB with key: ${this.tokenKey}`);
            const record = await this.prisma.appConfig.findUnique({
                where: { key: this.tokenKey },
            });

            if (!record) {
                if (!this.tokenLoadedOnce) {
                    this.logger.warn(`No Fyers token found in database for key '${this.tokenKey}'. Please authenticate.`);
                    this.tokenLoadedOnce = true;
                }
                return;
            }
            this.logger.log(`✅ Loaded active Fyers token from database (${this.tokenKey}).`);
            const data = JSON.parse(record.value);
            const tokenDate = new Date(data.date);
            // ... (rest of the logic remains)

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
