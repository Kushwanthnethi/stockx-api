import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StocksService } from './stocks.service';
import { MailService } from '../services/mail.service';
import * as ExcelJS from 'exceljs';

@Injectable()
export class SowReportService {
    private readonly logger = new Logger(SowReportService.name);

    constructor(
        private prisma: PrismaService,
        private stocksService: StocksService,
        private mailService: MailService,
    ) { }

    // ─── Daily Cron: 3:35 PM IST (Mon–Fri) = 10:05 AM UTC ───
    @Cron('5 10 * * 1-5')
    async recordDailyPrices() {
        this.logger.log('Recording daily open/close for active SOW picks...');
        try {
            const activePicks = await this.prisma.stockOfTheWeek.findMany({
                where: { finalPrice: null },
            });

            if (activePicks.length === 0) {
                this.logger.log('No active SOW picks to record.');
                return;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const pick of activePicks) {
                try {
                    // Use getQuotes for reliable daily OHLCV
                    const quotes = await this.stocksService.getQuotes([pick.stockSymbol]);
                    const quote = quotes?.[0];

                    if (!quote) {
                        this.logger.warn(`No quote data for ${pick.stockSymbol}`);
                        continue;
                    }

                    const openPrice = quote.regularMarketOpen || quote.regularMarketPreviousClose || 0;
                    const closePrice = quote.regularMarketPrice || 0;
                    const highPrice = quote.regularMarketDayHigh || null;
                    const lowPrice = quote.regularMarketDayLow || null;
                    const volume = quote.regularMarketVolume || null;

                    const changePct = openPrice > 0
                        ? ((closePrice - openPrice) / openPrice) * 100
                        : null;

                    await this.prisma.sowDailyPrice.upsert({
                        where: { sowId_date: { sowId: pick.id, date: today } },
                        update: { openPrice, closePrice, highPrice, lowPrice, volume, changePct },
                        create: {
                            sowId: pick.id,
                            date: today,
                            openPrice,
                            closePrice,
                            highPrice,
                            lowPrice,
                            volume,
                            changePct,
                        },
                    });

                    this.logger.log(`Recorded ${pick.stockSymbol}: Open ₹${openPrice?.toFixed(2)}, Close ₹${closePrice?.toFixed(2)}`);
                } catch (e) {
                    this.logger.error(`Failed to record daily price for ${pick.stockSymbol}: ${e.message}`);
                }
            }
        } catch (e) {
            this.logger.error(`Daily price recording failed: ${e.message}`);
        }
    }

    // ─── Monthly Cron: 1st of each month at 12:30 PM IST = 7:00 AM UTC ───
    @Cron('0 7 1 * *')
    async sendMonthlyReport(testEmail?: string, month?: number, year?: number) {
        this.logger.log(`Generating monthly SOW report...${testEmail ? ` (Test Mode: ${testEmail})` : ''}${month && year ? ` (Period: ${month}/${year})` : ''}`);
        try {
            const now = new Date();
            let targetYear = year || now.getFullYear();
            let targetMonth = month ? month - 1 : now.getMonth() - 1; // month is 1-indexed in query, Date uses 0-indexed

            const firstOfLastMonth = new Date(targetYear, targetMonth, 1);
            const lastOfLastMonth = new Date(targetYear, targetMonth + 1, 0);

            // Get all SOW picks from last month
            const picks = await this.prisma.stockOfTheWeek.findMany({
                where: {
                    weekStartDate: {
                        gte: firstOfLastMonth,
                        lte: lastOfLastMonth,
                    },
                },
                include: {
                    stock: true,
                    dailyPrices: { orderBy: { date: 'asc' } },
                },
                orderBy: { weekStartDate: 'asc' },
            });

            if (picks.length === 0) {
                this.logger.log('No SOW picks found for last month. Skipping.');
                return;
            }

            // Generate Excel
            const excelBuffer = await this.generateExcel(picks, firstOfLastMonth);

            // Get opted-in users or test user
            let optedInUsers;
            if (testEmail) {
                optedInUsers = await this.prisma.user.findMany({
                    where: { email: testEmail },
                    select: { email: true, firstName: true, handle: true },
                });
            } else {
                optedInUsers = await this.prisma.user.findMany({
                    where: { receiveReport: true },
                    select: { email: true, firstName: true, handle: true },
                });
            }

            if (optedInUsers.length === 0) {
                this.logger.log('No users opted in for reports. Skipping email.');
                return;
            }

            const monthName = firstOfLastMonth.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
            const subject = `📊 StocksX — Stock of the Week Report | ${monthName}`;

            // Email to each opted-in user
            for (const user of optedInUsers) {
                const name = user.firstName || user.handle || 'Investor';
                const html = this.buildEmailHtml(name, monthName, picks);

                await this.mailService.sendEmailWithAttachment(
                    user.email,
                    subject,
                    html,
                    excelBuffer,
                    `StocksX_SOW_Report_${monthName.replace(/\s/g, '_')}.xlsx`,
                );

                this.logger.log(`Monthly report sent to ${user.email}`);
            }

            this.logger.log(`Monthly report sent to ${optedInUsers.length} users.`);
        } catch (e) {
            this.logger.error(`Monthly report generation failed: ${e.message}`);
        }
    }

    // ─── Excel Generation Engine ───
    async generateExcel(picks: any[], monthDate: Date): Promise<Buffer> {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'StocksX';
        workbook.created = new Date();

        const monthName = monthDate.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

        // Brand colors
        const darkGreen = '1B5E20';
        const medGreen = '2E7D32';
        const lightGreen = 'E8F5E9';
        const accentGold = 'FFD600';
        const white = 'FFFFFF';
        const darkText = '212121';
        const red = 'C62828';
        const green = '2E7D32';

        // ─────────── SUMMARY SHEET ───────────
        const summary = workbook.addWorksheet('Summary', {
            properties: { tabColor: { argb: darkGreen } },
        });

        // Title
        summary.mergeCells('A1:H1');
        const titleCell = summary.getCell('A1');
        titleCell.value = `StocksX — Stock of the Week Report`;
        titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: white } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: darkGreen } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        summary.getRow(1).height = 48;

        // Subtitle
        summary.mergeCells('A2:H2');
        const subtitleCell = summary.getCell('A2');
        subtitleCell.value = monthName;
        subtitleCell.font = { name: 'Calibri', size: 14, italic: true, color: { argb: white } };
        subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: medGreen } };
        subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        summary.getRow(2).height = 32;

        // Empty row
        summary.getRow(3).height = 12;

        // Summary headers
        const summaryHeaders = ['Week', 'Stock', 'Company', 'Entry Price', 'Target', 'Stop Loss', 'Max High', 'Return %'];
        const headerRow = summary.getRow(4);
        summaryHeaders.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h;
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: white } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: darkGreen } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
                bottom: { style: 'medium', color: { argb: accentGold } },
            };
        });
        headerRow.height = 28;

        // Summary data rows
        picks.forEach((pick, idx) => {
            const row = summary.getRow(5 + idx);
            const weekNum = `Week ${idx + 1}`;
            const lastClose = pick.dailyPrices.length > 0
                ? pick.dailyPrices[pick.dailyPrices.length - 1].closePrice
                : pick.priceAtSelection;
            const returnPct = ((lastClose - pick.priceAtSelection) / pick.priceAtSelection) * 100;

            const values = [
                weekNum,
                pick.stockSymbol,
                pick.stock?.companyName || pick.stockSymbol,
                pick.priceAtSelection,
                pick.targetPrice,
                pick.stopLoss,
                pick.maxHigh || pick.priceAtSelection,
                returnPct,
            ];

            values.forEach((v, i) => {
                const cell = row.getCell(i + 1);
                cell.value = v;
                cell.font = { name: 'Calibri', size: 11, color: { argb: darkText } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };

                // Zebra striping
                if (idx % 2 === 0) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreen } };
                }

                // Format prices
                if (i >= 3 && i <= 6) {
                    cell.numFmt = '₹#,##0.00';
                }

                // Format return % with color
                if (i === 7) {
                    cell.numFmt = '+0.00%;-0.00%';
                    cell.value = returnPct / 100; // Excel expects decimal
                    cell.font = {
                        name: 'Calibri', size: 11, bold: true,
                        color: { argb: returnPct >= 0 ? green : red },
                    };
                }
            });
            row.height = 24;
        });

        // Auto-width summary columns
        summary.columns.forEach((col) => {
            col.width = 18;
        });
        summary.getColumn(3).width = 28; // Company name

        // Freeze header
        summary.views = [{ state: 'frozen', ySplit: 4 }];

        // ─────────── INDIVIDUAL STOCK SHEETS ───────────
        picks.forEach((pick, idx) => {
            const sheetName = `Week ${idx + 1} - ${pick.stockSymbol.replace('.NS', '')}`;
            const ws = workbook.addWorksheet(sheetName, {
                properties: { tabColor: { argb: idx % 2 === 0 ? darkGreen : medGreen } },
            });

            // Sheet title
            ws.mergeCells('A1:H1');
            const stTitle = ws.getCell('A1');
            stTitle.value = `${pick.stock?.companyName || pick.stockSymbol} (${pick.stockSymbol})`;
            stTitle.font = { name: 'Calibri', size: 16, bold: true, color: { argb: white } };
            stTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: darkGreen } };
            stTitle.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(1).height = 40;

            // Info row
            ws.mergeCells('A2:H2');
            const infoCell = ws.getCell('A2');
            const weekStart = pick.weekStartDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            infoCell.value = `Week ${idx + 1} | Started: ${weekStart} | Entry: ₹${pick.priceAtSelection?.toFixed(2)} | Target: ₹${pick.targetPrice?.toFixed(2)} | Stop Loss: ₹${pick.stopLoss?.toFixed(2)}`;
            infoCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: white } };
            infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: medGreen } };
            infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
            ws.getRow(2).height = 26;

            // Empty spacer
            ws.getRow(3).height = 8;

            // Daily data headers
            const dailyHeaders = ['Date', 'Open', 'Close', 'Day Change', 'Change %', 'High', 'Low', 'Volume'];
            const dhRow = ws.getRow(4);
            dailyHeaders.forEach((h, i) => {
                const cell = dhRow.getCell(i + 1);
                cell.value = h;
                cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: white } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: darkGreen } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { bottom: { style: 'medium', color: { argb: accentGold } } };
            });
            dhRow.height = 28;

            // Daily data rows
            const dailyPrices = pick.dailyPrices || [];
            dailyPrices.forEach((dp: any, dIdx: number) => {
                const row = ws.getRow(5 + dIdx);
                const dayChange = dp.closePrice - dp.openPrice;
                const dayChangePct = dp.openPrice > 0 ? (dayChange / dp.openPrice) * 100 : 0;

                const dateStr = new Date(dp.date).toLocaleDateString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short',
                });

                row.getCell(1).value = dateStr;
                row.getCell(2).value = dp.openPrice;
                row.getCell(3).value = dp.closePrice;
                row.getCell(4).value = dayChange;
                row.getCell(5).value = dayChangePct / 100;
                row.getCell(6).value = dp.highPrice;
                row.getCell(7).value = dp.lowPrice;
                row.getCell(8).value = dp.volume;

                // Style each cell
                for (let c = 1; c <= 8; c++) {
                    const cell = row.getCell(c);
                    cell.font = { name: 'Calibri', size: 11, color: { argb: darkText } };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };

                    // Zebra
                    if (dIdx % 2 === 0) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightGreen } };
                    }
                }

                // Price formatting
                [2, 3, 6, 7].forEach(c => { row.getCell(c).numFmt = '₹#,##0.00'; });
                row.getCell(4).numFmt = '+₹#,##0.00;-₹#,##0.00';
                row.getCell(5).numFmt = '+0.00%;-0.00%';
                row.getCell(8).numFmt = '#,##0';

                // Color the change columns
                const changeColor = dayChange >= 0 ? green : red;
                row.getCell(4).font = { name: 'Calibri', size: 11, bold: true, color: { argb: changeColor } };
                row.getCell(5).font = { name: 'Calibri', size: 11, bold: true, color: { argb: changeColor } };

                row.height = 22;
            });

            // Auto-width
            ws.columns.forEach((col) => { col.width = 16; });
            ws.getColumn(1).width = 20; // Date
            ws.getColumn(8).width = 14; // Volume

            // Freeze header
            ws.views = [{ state: 'frozen', ySplit: 4 }];
        });

        // Write to buffer
        const buffer = await workbook.xlsx.writeBuffer();
        return Buffer.from(buffer);
    }

    // ─── Email HTML Template ───
    private buildEmailHtml(name: string, month: string, picks: any[]): string {
        const stockSummary = picks.map((p, i) => {
            const lastClose = p.dailyPrices?.length > 0
                ? p.dailyPrices[p.dailyPrices.length - 1].closePrice
                : p.priceAtSelection;
            const ret = ((lastClose - p.priceAtSelection) / p.priceAtSelection * 100).toFixed(2);
            const color = parseFloat(ret) >= 0 ? '#2E7D32' : '#C62828';
            return `<tr>
        <td style="padding: 10px 16px; border-bottom: 1px solid #eee;">Week ${i + 1}</td>
        <td style="padding: 10px 16px; border-bottom: 1px solid #eee; font-weight: 600;">${p.stockSymbol}</td>
        <td style="padding: 10px 16px; border-bottom: 1px solid #eee;">₹${p.priceAtSelection?.toFixed(2)}</td>
        <td style="padding: 10px 16px; border-bottom: 1px solid #eee; color: ${color}; font-weight: 700;">${parseFloat(ret) >= 0 ? '+' : ''}${ret}%</td>
      </tr>`;
        }).join('');

        return `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #1B5E20, #2E7D32); padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: #FFFFFF; margin: 0; font-size: 24px;">📊 StocksX</h1>
          <p style="color: #C8E6C9; margin: 8px 0 0; font-size: 14px;">Stock of the Week — Monthly Report</p>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${name}</strong>,</p>
          <p style="font-size: 14px; color: #666; line-height: 1.6;">
            Here's your monthly Stock of the Week performance report for <strong>${month}</strong>.
            The detailed daily open/close data is attached as an Excel file.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <thead>
              <tr style="background: #1B5E20; color: white;">
                <th style="padding: 10px 16px; text-align: left;">Week</th>
                <th style="padding: 10px 16px; text-align: left;">Stock</th>
                <th style="padding: 10px 16px; text-align: left;">Entry</th>
                <th style="padding: 10px 16px; text-align: left;">Return</th>
              </tr>
            </thead>
            <tbody>${stockSummary}</tbody>
          </table>
          <p style="font-size: 12px; color: #999; text-align: center; margin-top: 24px;">
            You're receiving this because you opted in. Manage preferences in your StocksX profile settings.
          </p>
        </div>
        <div style="background: #F5F5F5; text-align: center; padding: 16px; border-radius: 0 0 8px 8px;">
          <p style="margin: 0; font-size: 12px; color: #999;">© ${new Date().getFullYear()} StocksX — Indian Stock Market Analysis & Insights</p>
        </div>
      </div>
    `;
    }

    // ─── Manual trigger (for testing) ───
    async triggerManualReport() {
        this.logger.log('Manual report trigger...');
        await this.recordDailyPrices();
        return { status: 'Daily prices recorded' };
    }

    async triggerMonthlyManual(testEmail?: string, month?: number, year?: number) {
        this.logger.log('Manual monthly report trigger...');
        await this.sendMonthlyReport(testEmail, month, year);
        return { status: 'Monthly report sent' };
    }
}
