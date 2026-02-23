import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { FyersService } from './fyers.service';
import type { Response } from 'express';

@Controller('fyers')
export class FyersController {
  private readonly logger = new Logger(FyersController.name);

  constructor(private readonly fyersService: FyersService) { }

  @Get('login')
  login(@Res() res: Response) {
    const url = this.fyersService.getLoginUrl();
    this.logger.log(`Redirecting to Fyers Login: ${url}`);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('auth_code') code: string, @Res() res: Response) {
    this.logger.log(`Received Fyers Auth Code: ${code}`);
    try {
      await this.fyersService.exchangeCodeForToken(code);
      return res.send(this.getSuccessHtml());
    } catch (error) {
      this.logger.warn(`Auth code exchange failed, checking if token was recently obtained: ${error.message}`);
      const existingToken = await this.fyersService.getAccessToken();
      if (existingToken) {
        this.logger.log('Active token found, treating as success (likely duplicate request).');
        return res.send(this.getSuccessHtml());
      }

      this.logger.error('Fyers callback error:', error.message);
      return res.status(500).send(this.getErrorHtml(error.message));
    }
  }

  private getSuccessHtml() {
    return `
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
          <div style="text-align: center; padding: 2rem; border-radius: 1rem; background: #1e293b; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);">
            <h1 style="color: #10b981;">✅ Fyers Connected</h1>
            <p>Authentication successful. You can close this tab and return to StocksX.</p>
            <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; margin-top: 1rem;">Close Window</button>
          </div>
          <script>setTimeout(() => window.close(), 5000)</script>
        </body>
      </html>
    `;
  }

  private getErrorHtml(message: string) {
    return `
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
          <div style="text-align: center; padding: 2rem; border-radius: 1rem; background: #1e293b;">
            <h1 style="color: #ef4444;">❌ Connection Failed</h1>
            <p>${message}</p>
            <button onclick="window.history.back()" style="background: #475569; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; margin-top: 1rem;">Try Again</button>
          </div>
        </body>
      </html>
    `;
  }
}
