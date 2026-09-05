-- AlterTable
ALTER TABLE "channel_product_mappings" ADD COLUMN     "last_pushed_snapshot_hash" TEXT,
ADD COLUMN     "last_pushed_at" TIMESTAMPTZ;
