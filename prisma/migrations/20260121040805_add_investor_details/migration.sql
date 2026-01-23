-- CreateEnum
CREATE TYPE "InvestorStockStatus" AS ENUM ('HELD', 'SOLD');

-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "current_ratio" DOUBLE PRECISION,
ADD COLUMN     "debt_to_equity" DOUBLE PRECISION,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "earnings_growth" DOUBLE PRECISION,
ADD COLUMN     "ebitda" DOUBLE PRECISION,
ADD COLUMN     "free_cashflow" DOUBLE PRECISION,
ADD COLUMN     "quick_ratio" DOUBLE PRECISION,
ADD COLUMN     "revenue_growth" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "watchlist" (
    "user_id" TEXT NOT NULL,
    "stock_symbol" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("user_id","stock_symbol")
);

-- CreateTable
CREATE TABLE "investors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "image_url" TEXT,
    "strategy" TEXT,
    "net_worth" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_stocks" (
    "id" TEXT NOT NULL,
    "investor_id" TEXT NOT NULL,
    "stock_symbol" TEXT NOT NULL,
    "status" "InvestorStockStatus" NOT NULL,
    "quantity" TEXT,
    "average_price" DOUBLE PRECISION,

    CONSTRAINT "investor_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "post_id" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_stocks" ADD CONSTRAINT "investor_stocks_investor_id_fkey" FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_stocks" ADD CONSTRAINT "investor_stocks_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
