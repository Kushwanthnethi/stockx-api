-- CreateTable
CREATE TABLE "user_portfolios" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Portfolio',
    "is_encrypted" BOOLEAN NOT NULL DEFAULT true,
    "encrypted_data" TEXT,
    "total_value" DOUBLE PRECISION,
    "day_change" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_portfolio_stocks" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "stock_symbol" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "average_buy_price" DOUBLE PRECISION NOT NULL,
    "weightage" DOUBLE PRECISION,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_portfolio_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_portfolio_analyses" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "health_score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "insights" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_portfolio_analyses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_portfolios" ADD CONSTRAINT "user_portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_portfolio_stocks" ADD CONSTRAINT "user_portfolio_stocks_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "user_portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_portfolio_stocks" ADD CONSTRAINT "user_portfolio_stocks_stock_symbol_fkey" FOREIGN KEY ("stock_symbol") REFERENCES "stocks"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_portfolio_analyses" ADD CONSTRAINT "user_portfolio_analyses_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "user_portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
