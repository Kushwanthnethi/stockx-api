-- CreateTable
CREATE TABLE "user_visits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "visit_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_visits_user_id_visit_date_key" ON "user_visits"("user_id", "visit_date");

-- AddForeignKey
ALTER TABLE "user_visits" ADD CONSTRAINT "user_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
