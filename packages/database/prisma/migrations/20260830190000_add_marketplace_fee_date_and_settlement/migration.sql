-- AlterTable
ALTER TABLE "marketplace_fees" ADD COLUMN     "settlement_id" TEXT;
ALTER TABLE "marketplace_fees" ADD COLUMN     "fee_date" TIMESTAMPTZ NOT NULL DEFAULT now();

-- AddForeignKey
ALTER TABLE "marketplace_fees" ADD CONSTRAINT "marketplace_fees_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: para toda taxa já sincronizada de um pedido (tem external_transaction_id), acha o
-- extrato de origem via settlement_transactions (mesma external_transaction_id) e usa o fim do
-- período do extrato como fee_date real, em vez de deixar a data de sincronização (created_at).
UPDATE "marketplace_fees" mf
SET "settlement_id" = st."settlement_id",
    "fee_date" = s."period_end"
FROM "settlement_transactions" st
JOIN "settlements" s ON s."id" = st."settlement_id"
WHERE mf."external_transaction_id" IS NOT NULL
  AND mf."external_transaction_id" = st."external_transaction_id";
