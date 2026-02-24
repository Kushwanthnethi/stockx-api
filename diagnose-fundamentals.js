// Diagnostic: Compare RELIANCE.NS vs INFY.NS data availability
const fs = require('fs');

async function diagnose(symbol) {
    const pkg = await import('yahoo-finance2');
    const YF = pkg.default || pkg;
    const yf = typeof YF === 'function' ? new YF() : YF;

    const out = [];
    const log = (msg) => out.push(msg);
    log(`\n${'='.repeat(60)}`);
    log(`DIAGNOSING: ${symbol}`);
    log('='.repeat(60));

    const result = await yf.quoteSummary(symbol, {
        modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData',
            'incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory']
    });

    // financialData — the golden source for Indian stocks
    log('\n--- financialData (pre-computed ratios) ---');
    const fd = result.financialData || {};
    const fdKeys = ['returnOnEquity', 'returnOnAssets', 'grossMargins', 'operatingMargins',
        'profitMargins', 'ebitda', 'totalDebt', 'totalCash', 'totalRevenue',
        'revenueGrowth', 'earningsGrowth', 'currentRatio', 'quickRatio',
        'debtToEquity', 'operatingCashflow', 'freeCashflow', 'financialCurrency'];
    for (const k of fdKeys) {
        const v = fd[k];
        log(`  ${k}: ${v !== undefined && v !== null ? JSON.stringify(v) : '❌ MISSING'}`);
    }

    // defaultKeyStatistics
    log('\n--- defaultKeyStatistics ---');
    const dk = result.defaultKeyStatistics || {};
    const dkKeys = ['sharesOutstanding', 'bookValue', 'priceToBook', 'trailingEps',
        'forwardEps', 'enterpriseValue', 'enterpriseToRevenue', 'enterpriseToEbitda',
        'earningsQuarterlyGrowth', 'netIncomeToCommon'];
    for (const k of dkKeys) {
        const v = dk[k];
        log(`  ${k}: ${v !== undefined && v !== null ? JSON.stringify(v) : '❌ MISSING'}`);
    }

    // summaryDetail
    log('\n--- summaryDetail ---');
    const sd = result.summaryDetail || {};
    const sdKeys = ['marketCap', 'trailingPE', 'dividendYield'];
    for (const k of sdKeys) {
        const v = sd[k];
        log(`  ${k}: ${v !== undefined && v !== null ? JSON.stringify(v) : '❌ MISSING'}`);
    }

    // incomeStatementHistory
    log('\n--- incomeStatementHistory ---');
    const income = result.incomeStatementHistory?.incomeStatementHistory || [];
    log(`  Count: ${income.length}`);
    if (income.length > 0) {
        const i = income[0];
        const iKeys = ['totalRevenue', 'costOfRevenue', 'grossProfit', 'operatingIncome',
            'ebit', 'netIncome', 'interestExpense', 'incomeTaxExpense'];
        for (const k of iKeys) {
            const v = i[k];
            const status = v === null || v === undefined ? '❌ null' : v === 0 ? '⚠️ 0 (fake)' : `✅ ${v}`;
            log(`    ${k}: ${status}`);
        }
    }

    // balanceSheetHistory
    log('\n--- balanceSheetHistory ---');
    const bal = result.balanceSheetHistory?.balanceSheetStatements || [];
    log(`  Count: ${bal.length}`);
    if (bal.length > 0) {
        const b = bal[0];
        const bKeys = ['totalAssets', 'totalCurrentAssets', 'totalCurrentLiabilities',
            'totalStockholderEquity', 'inventory', 'cash', 'totalLiab'];
        for (const k of bKeys) {
            const v = b[k];
            const status = v === null || v === undefined ? '❌ null' : v === 0 ? '⚠️ 0' : `✅ ${v}`;
            log(`    ${k}: ${status}`);
        }
    }

    // cashflowStatementHistory
    log('\n--- cashflowStatementHistory ---');
    const cf = result.cashflowStatementHistory?.cashflowStatements || [];
    log(`  Count: ${cf.length}`);
    if (cf.length > 0) {
        const c = cf[0];
        const cKeys = ['totalCashFromOperatingActivities', 'capitalExpenditures', 'netIncome', 'depreciation'];
        for (const k of cKeys) {
            const v = c[k];
            const status = v === null || v === undefined ? '❌ null' : v === 0 ? '⚠️ 0' : `✅ ${v}`;
            log(`    ${k}: ${status}`);
        }
    }

    return out.join('\n');
}

async function main() {
    let allOutput = '';
    for (const sym of ['RELIANCE.NS', 'INFY.NS', 'HDFCBANK.NS', 'TCS.NS', 'ITC.NS']) {
        try {
            allOutput += await diagnose(sym) + '\n';
        } catch (e) {
            allOutput += `\n${sym} FAILED: ${e.message}\n`;
        }
    }
    fs.writeFileSync('diagnose-compare.txt', allOutput);
    console.log('Done! Written to diagnose-compare.txt');
}
main().catch(e => console.error('FATAL:', e.message));
