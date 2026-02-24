// Reset stale fundamentals: convert 0 values to NULL so they get re-fetched
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetStaleFundamentals() {
    // Set all fundamental metrics that are 0 to null, forcing re-fetch
    const result = await prisma.$executeRawUnsafe(`
        UPDATE stocks SET
            return_on_equity = CASE WHEN return_on_equity = 0 THEN NULL ELSE return_on_equity END,
            return_on_assets = CASE WHEN return_on_assets = 0 THEN NULL ELSE return_on_assets END,
            return_on_capital_employed = CASE WHEN return_on_capital_employed = 0 THEN NULL ELSE return_on_capital_employed END,
            profit_margins = CASE WHEN profit_margins = 0 THEN NULL ELSE profit_margins END,
            operating_margins = CASE WHEN operating_margins = 0 THEN NULL ELSE operating_margins END,
            current_ratio = CASE WHEN current_ratio = 0 THEN NULL ELSE current_ratio END,
            quick_ratio = CASE WHEN quick_ratio = 0 THEN NULL ELSE quick_ratio END,
            debt_to_equity = CASE WHEN debt_to_equity = 0 THEN NULL ELSE debt_to_equity END,
            interest_coverage_ratio = CASE WHEN interest_coverage_ratio = 0 THEN NULL ELSE interest_coverage_ratio END,
            revenue_growth = CASE WHEN revenue_growth = 0 THEN NULL ELSE revenue_growth END,
            earnings_growth = CASE WHEN earnings_growth = 0 THEN NULL ELSE earnings_growth END,
            ebitda = CASE WHEN ebitda = 0 THEN NULL ELSE ebitda END,
            total_debt = CASE WHEN total_debt = 0 THEN NULL ELSE total_debt END,
            free_cashflow = CASE WHEN free_cashflow = 0 THEN NULL ELSE free_cashflow END,
            ocf_ratio = CASE WHEN ocf_ratio = 0 THEN NULL ELSE ocf_ratio END,
            ev_ebitda = CASE WHEN ev_ebitda = 0 THEN NULL ELSE ev_ebitda END,
            book_value_per_share = CASE WHEN book_value_per_share = 0 THEN NULL ELSE book_value_per_share END,
            book_value = CASE WHEN book_value = 0 THEN NULL ELSE book_value END,
            -- Also force re-fetch by backdating lastUpdated
            last_updated = NOW() - INTERVAL '2 days'
    `);
    console.log(`Reset stale fundamentals for all stocks. Rows affected: ${result}`);
}

resetStaleFundamentals()
    .then(() => prisma.$disconnect())
    .catch(e => { console.error(e); prisma.$disconnect(); });
