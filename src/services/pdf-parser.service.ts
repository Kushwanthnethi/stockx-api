import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdf = require('pdf-parse');

export interface ParsedFinancials {
    revenue?: number;
    expenses?: number;
    netProfit?: number;
    eps?: number;
    reserves?: number;
    assets?: number;
    period?: string; // e.g. "Jun 2025"
}

@Injectable()
export class PdfParserService {

    async parsePdf(filePath: string): Promise<ParsedFinancials> {
        console.log(`Parsing PDF: ${filePath}`);
        const dataBuffer = fs.readFileSync(filePath);

        try {
            const data = await pdf(dataBuffer);
            const text = data.text;

            // console.log('Extracted Text Preview:', text.substring(0, 500)); // Debug

            return this.extractMetrics(text);

        } catch (error) {
            console.error('PDF Parse Error:', error);
            throw error;
        }
    }

    private extractMetrics(text: string): ParsedFinancials {
        const result: ParsedFinancials = {};

        // Helper to find number after a keyword
        // Regex looks for Keyword ... (some spaces) ... Number
        // We handle commas in numbers (e.g. 1,00,000)
        const findValue = (keywords: string[]): number | undefined => {
            for (const keyword of keywords) {
                // Pattern: Keyword followed by optional characters, then a number (possibly with commas/decimals)
                // We look for the FIRST number usually, or a number at the end of the line
                // This is a naive implementation for POC. 
                // A better approach is to find the line, then split by space, finding the number.

                const regex = new RegExp(`${keyword}.*?([\\d,]+\\.?\\d*)`, 'i');
                const match = text.match(regex);
                if (match && match[1]) {
                    // Clean string: remove commas
                    const cleanNum = match[1].replace(/,/g, '');
                    return parseFloat(cleanNum);
                }
            }
            return undefined;
        };

        // 1. Revenue
        result.revenue = findValue(['Total Income', 'Revenue from Operations', 'Total Revenue']);

        // 2. Expenses
        result.expenses = findValue(['Total Expenses']);

        // 3. Net Profit
        result.netProfit = findValue(['Net Profit for the period', 'Profit after tax', 'Profit for the period']);

        // 4. EPS
        result.eps = findValue(['Basic EPS', 'Earnings Per Share']);

        // 5. Balance Sheet Items (if available)
        result.reserves = findValue(['Total Equity', 'Other Equity']);
        result.assets = findValue(['Total Assets']);

        console.log('Extracted Metrics:', result);
        return result;
    }
}
