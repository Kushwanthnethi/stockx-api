-- AlterTable
ALTER TABLE "stock_of_the_week" ADD COLUMN     "max_high" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "earnings_date" TIMESTAMP(3),
ADD COLUMN     "is_midcap_100" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "last_result_date" TIMESTAMP(3),
ADD COLUMN     "result_status" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "financial_results" (
    "id" TEXT NOT NULL,
    "stock_symbol" TEXT NOT NULL,
    "result_type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" DOUBLE PRECISION,
    "expenses" DOUBLE PRECISION,
    "operating_profit" DOUBLE PRECISION,
    "net_profit" DOUBLE PRECISION,
    "eps" DOUBLE PRECISION,
    "equity_capital" DOUBLE PRECISION,
    "reserves" DOUBLE PRECISION,
    "borrowings" DOUBLE PRECISION,
    "other_liabilities" DOUBLE PRECISION,
    "total_liabilities" DOUBLE PRECISION,
    "fixed_assets" DOUBLE PRECISION,
    "cwip" DOUBLE PRECISION,
    "investments" DOUBLE PRECISION,
    "other_assets" DOUBLE PRECISION,
    "total_assets" DOUBLE PRECISION,
    "pdf_url" TEXT,
    "raw_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_results_stock_symbol_date_idx" ON "financial_results"("stock_symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "financial_results_stock_symbol_period_result_type_key" ON "financial_results"("stock_symbol", "period", "result_type");

-- AddForeignKey
ALTER TABLE "financial_results" ADD CONSTRAINT "financial_results_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;
