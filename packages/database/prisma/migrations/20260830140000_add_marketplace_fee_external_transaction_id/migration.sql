-- AlterTable
ALTER TABLE "marketplace_fees" ADD COLUMN     "external_transaction_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_fees_external_transaction_id_key" ON "marketplace_fees"("external_transaction_id");
