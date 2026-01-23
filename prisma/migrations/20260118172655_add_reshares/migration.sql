-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "original_post_id" TEXT,
ADD COLUMN     "reshare_count" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_original_post_id_fkey" FOREIGN KEY ("original_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
