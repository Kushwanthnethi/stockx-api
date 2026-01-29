-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "is_nifty_50" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "stock_verdicts" (
    "id" TEXT NOT NULL,
    "stock_symbol" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),

    CONSTRAINT "stock_verdicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_of_the_week" (
    "id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "stock_symbol" TEXT NOT NULL,
    "conviction_score" DOUBLE PRECISION NOT NULL,
    "narrative" TEXT NOT NULL,
    "price_at_selection" DOUBLE PRECISION NOT NULL,
    "target_price" DOUBLE PRECISION,
    "stop_loss" DOUBLE PRECISION,
    "final_price" DOUBLE PRECISION,
    "performance_pct" DOUBLE PRECISION,
    "benchmark_return" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_of_the_week_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_verdicts_stock_symbol_idx" ON "stock_verdicts"("stock_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "stock_of_the_week_week_start_date_key" ON "stock_of_the_week"("week_start_date");

-- AddForeignKey
ALTER TABLE "stock_verdicts" ADD CONSTRAINT "stock_verdicts_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_of_the_week" ADD CONSTRAINT "stock_of_the_week_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;
