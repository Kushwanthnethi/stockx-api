import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
// @ts-ignore
import { SmartAPI } from 'smartapi-javascript';
import { AngelInstrumentService } from './angel-instrument.service';
// @ts-ignore
const { TOTP } = require("totp-generator");

@Injectable()
export class AngelOneService implements OnModuleInit {
    private readonly logger = new Logger(AngelOneService.name);
    private smartApi: any;
    private historicalSmartApi: any;
    private jwtToken: string | null = null;
    private feedToken: string | null = null;
    private refreshToken: string | null = null;
    private readonly tokenKey: string;

    constructor(
        private configService: ConfigService,
        private prisma: PrismaService,
        private instrumentService: AngelInstrumentService,
    ) {
        this.tokenKey = process.env.RENDER === 'true' ? 'angel_token_prod' : 'angel_token_local';
        this.logger.log(`AngelOneService Initialized. Key: ${this.tokenKey}`);
    }

    async onModuleInit() {
        const apiKey = this.configService.get<string>('ANGEL_API_KEY')?.trim();
        if (!apiKey) {
            this.logger.warn('ANGEL_API_KEY is not defined. Angel One features will be disabled.');
            return;
        }

        this.smartApi = new SmartAPI({
            api_key: apiKey,
        });

        const histApiKey = this.configService.get<string>('ANGEL_HISTORICAL_API_KEY')?.trim();
        if (histApiKey) {
            this.historicalSmartApi = new SmartAPI({
                api_key: histApiKey,
            });
            this.logger.log('Angel One Historical SmartAPI Initialized.');
        }

        await this.loadTokenFromDb();
        if (!this.jwtToken) {
            await this.login();
        } else {
            // Restore session
            this.smartApi.setAccessToken(this.jwtToken);
            this.smartApi.setPublicToken(this.refreshToken);
            // Try generating a new token from refresh token to ensure validity
            await this.refreshTokenIfPossible();
            this.setHistoricalAccessToken();
        }
    }

    private setHistoricalAccessToken() {
        if (this.historicalSmartApi && this.jwtToken) {
            this.historicalSmartApi.setAccessToken(this.jwtToken);
            this.historicalSmartApi.setPublicToken(this.refreshToken);
        }
    }

    private async refreshTokenIfPossible() {
        if (!this.refreshToken) return;
        try {
            const data = await this.smartApi.generateToken(this.refreshToken);
            if (data.status) {
                this.jwtToken = data.data.jwtToken;
                this.feedToken = data.data.feedToken;
                this.refreshToken = data.data.refreshToken;
                await this.saveTokenToDb();
                this.logger.log('Angel One token refreshed successfully.');
            } else {
                this.logger.warn(`Failed to refresh Angel One token: ${data.message}`);
                await this.login(); // Fallback to full login if refresh fails
            }
        } catch (error) {
            this.logger.error('Error refreshing token, falling back to login', error);
            await this.login();
        }
    }

    @Cron('0 30 8 * * *', {
        name: 'angel_one_daily_login',
        timeZone: 'Asia/Kolkata'
    })
    async dailyLogin() {
        this.logger.log('Executing scheduled daily Angel One login (8:30 AM IST)...');
        await this.login();
    }

    async login() {
        try {
            const clientId = this.configService.get<string>('ANGEL_CLIENT_ID')?.trim();
            const pin = this.configService.get<string>('ANGEL_PIN')?.trim();
            const totpSecret = this.configService.get<string>('ANGEL_TOTP_SECRET')?.trim();

            if (!clientId || !pin || !totpSecret) {
                this.logger.error('Missing ANGEL_CLIENT_ID, ANGEL_PIN, or ANGEL_TOTP_SECRET. Cannot login.');
                return false;
            }

            // Generate TOTP immediately before login attempt
            const { otp: totp } = await TOTP.generate(totpSecret);

            this.logger.log(`Attempting Angel One login for client: ${clientId}...`);
            const data = await this.smartApi.generateSession(clientId, pin, totp);

            if (data.status) {
                this.jwtToken = data.data.jwtToken;
                this.refreshToken = data.data.refreshToken;
                this.feedToken = data.data.feedToken;
                await this.saveTokenToDb();
                this.setHistoricalAccessToken();
                this.logger.log('✅ Angel One successfully logged in and token saved.');
                return true;
            } else {
                this.logger.error(`Angel One Login Failed: ${data.message || JSON.stringify(data)}`);
                // Clear state
                this.jwtToken = null;
                this.refreshToken = null;
                this.feedToken = null;
                return false;
            }
        } catch (error) {
            this.logger.error('Exception during Angel One login:', error.message);
            return false;
        }
    }

    getFeedToken(): string | null {
        return this.feedToken;
    }

    getJwtToken(): string | null {
        return this.jwtToken;
    }

    getClientId(): string | null {
        return this.configService.get<string>('ANGEL_CLIENT_ID')?.trim() || null;
    }

    getApiKey(): string | null {
        return this.configService.get<string>('ANGEL_API_KEY')?.trim() || null;
    }

    getRuntimeStatus() {
        return {
            hasApiKey: Boolean(this.getApiKey()),
            hasClientId: Boolean(this.getClientId()),
            hasPin: Boolean(this.configService.get<string>('ANGEL_PIN')?.trim()),
            hasTotpSecret: Boolean(this.configService.get<string>('ANGEL_TOTP_SECRET')?.trim()),
            hasJwtToken: Boolean(this.jwtToken),
            hasFeedToken: Boolean(this.feedToken),
            hasRefreshToken: Boolean(this.refreshToken),
            historicalApiEnabled: Boolean(this.historicalSmartApi),
        };
    }

    private async saveTokenToDb() {
        try {
            const data = JSON.stringify({
                jwtToken: this.jwtToken,
                refreshToken: this.refreshToken,
                feedToken: this.feedToken,
                date: new Date().toISOString(),
            });
            await this.prisma.appConfig.upsert({
                where: { key: this.tokenKey },
                update: { value: data },
                create: { key: this.tokenKey, value: data },
            });
        } catch (error) {
            this.logger.error('Failed to save Angel token to database:', error.message);
        }
    }

    private async loadTokenFromDb() {
        try {
            const record = await this.prisma.appConfig.findUnique({
                where: { key: this.tokenKey },
            });

            if (!record) {
                this.logger.log('No existing Angel token found in DB.');
                return;
            }

            const data = JSON.parse(record.value);
            const tokenDate = new Date(data.date);
            const todayIST = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
            const tokenIST = new Date(tokenDate.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];

            if (todayIST === tokenIST) {
                this.jwtToken = data.jwtToken;
                this.refreshToken = data.refreshToken;
                this.feedToken = data.feedToken;
                this.logger.log(`✅ Loaded active Angel token from database (${this.tokenKey}).`);
            } else {
                this.logger.log('Angel token from DB is from a previous day. Will re-login.');
            }
        } catch (error) {
            this.logger.error('Failed to load Angel token from database:', error.message);
        }
    }

    async getHistoricalData(params: {
        symbol: string;
        interval: string;
        fromdate: string;
        todate: string;
    }) {
        if (!this.historicalSmartApi) {
            this.logger.error('Historical SmartAPI not initialized (missing API Key).');
            return null;
        }

        const token = this.instrumentService.getToken(params.symbol);
        if (!token) {
            this.logger.error(`No Angel token found for symbol: ${params.symbol}`);
            return null;
        }

        const exchange = this.instrumentService.getExchangeSegment(token);

        try {
            this.logger.log(`Fetching historical data from Angel One for ${params.symbol} (${token}, ${exchange})...`);
            const result = await this.historicalSmartApi.getCandleData({
                exchange: exchange,
                symboltoken: token,
                interval: params.interval,
                fromdate: params.fromdate,
                todate: params.todate,
            });

            if (result && result.status && result.data) {
                return result.data;
            } else {
                this.logger.warn(`Angel One Historical Data failed for ${params.symbol}: ${result?.message || 'Empty response'}`);
                return null;
            }
        } catch (error) {
            this.logger.error(`Error fetching historical data from Angel One: ${error.message}`);
            return null;
        }
    }
}
