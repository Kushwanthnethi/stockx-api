-- AlterTable
ALTER TABLE "stocks" ADD COLUMN     "book_value_per_share" DOUBLE PRECISION,
ADD COLUMN     "capital_expenditure" DOUBLE PRECISION,
ADD COLUMN     "cash_flow_to_debt" DOUBLE PRECISION,
ADD COLUMN     "enterprise_value" DOUBLE PRECISION,
ADD COLUMN     "eps" DOUBLE PRECISION,
ADD COLUMN     "eps_growth" DOUBLE PRECISION,
ADD COLUMN     "ev_ebitda" DOUBLE PRECISION,
ADD COLUMN     "fcf_margin" DOUBLE PRECISION,
ADD COLUMN     "graham_number" DOUBLE PRECISION,
ADD COLUMN     "gross_margin" DOUBLE PRECISION,
ADD COLUMN     "interest_coverage_ratio" DOUBLE PRECISION,
ADD COLUMN     "intrinsic_value" DOUBLE PRECISION,
ADD COLUMN     "ocf_ratio" DOUBLE PRECISION,
ADD COLUMN     "operating_cash_flow" DOUBLE PRECISION,
ADD COLUMN     "peg_ratio" DOUBLE PRECISION,
ADD COLUMN     "return_on_capital_employed" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "receive_report" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sow_daily_prices" (
    "id" TEXT NOT NULL,
    "sow_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open_price" DOUBLE PRECISION NOT NULL,
    "close_price" DOUBLE PRECISION NOT NULL,
    "high_price" DOUBLE PRECISION,
    "low_price" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "change_pct" DOUBLE PRECISION,

    CONSTRAINT "sow_daily_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "otps_email_idx" ON "otps"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sow_daily_prices_sow_id_date_key" ON "sow_daily_prices"("sow_id", "date");

-- AddForeignKey
ALTER TABLE "sow_daily_prices" ADD CONSTRAINT "sow_daily_prices_sow_id_fkey" FOREIGN KEY ("sow_id") REFERENCES "stock_of_the_week"("id") ON DELETE CASCADE ON UPDATE CASCADE;
