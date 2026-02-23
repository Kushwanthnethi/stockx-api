import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { fyersModel } from 'fyers-api-v3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FyersService implements OnModuleInit {
    private readonly logger = new Logger(FyersService.name);
    private accessToken: string | null = null;
    private readonly tokenFilePath = path.join(process.cwd(), 'fyers_token.json');

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        this.loadTokenFromFile();
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
                this.saveTokenToFile(token);
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
            this.loadTokenFromFile();
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

    private saveTokenToFile(token: string) {
        try {
            fs.writeFileSync(this.tokenFilePath, JSON.stringify({ access_token: token, date: new Date().toISOString() }));
            this.logger.log('Fyers token saved to file.');
        } catch (error) {
            this.logger.error('Failed to save Fyers token to file:', error.message);
        }
    }

    private loadTokenFromFile() {
        if (fs.existsSync(this.tokenFilePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
                const tokenDate = new Date(data.date);
                const now = new Date();

                // Check if token is from today (Fyers tokens are valid for one day)
                if (tokenDate.toDateString() === now.toDateString()) {
                    this.accessToken = data.access_token;
                    this.logger.log('Loaded active Fyers token from file.');
                } else {
                    this.logger.warn('Saved Fyers token is expired.');
                }
            } catch (error) {
                this.logger.error('Failed to load Fyers token from file:', error.message);
            }
        }
    }
}
