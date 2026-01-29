-- AlterTable
ALTER TABLE "stocks" ADD COLUMN IF NOT EXISTS "is_nifty_50" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "stock_verdicts" (
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
CREATE TABLE IF NOT EXISTS "stock_of_the_week" (
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
CREATE INDEX IF NOT EXISTS "stock_verdicts_stock_symbol_idx" ON "stock_verdicts"("stock_symbol");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_of_the_week_week_start_date_key" ON "stock_of_the_week"("week_start_date");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_verdicts_stock_symbol_fkey') THEN
        ALTER TABLE "stock_verdicts" ADD CONSTRAINT "stock_verdicts_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_of_the_week_stock_symbol_fkey') THEN
        ALTER TABLE "stock_of_the_week" ADD CONSTRAINT "stock_of_the_week_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
