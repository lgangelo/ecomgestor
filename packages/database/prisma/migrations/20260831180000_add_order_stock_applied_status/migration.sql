-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "stock_applied_status" "OrderStatus" NOT NULL DEFAULT 'CREATED';

-- Backfill: para pedidos ja existentes, assume que o ledger de estoque ja esta consistente com o
-- status atual (verdade ate a introducao deste campo, ja que a atualizacao de status e o efeito
-- de estoque sempre foram atomicos na mesma transacao ate agora).
UPDATE "orders" SET "stock_applied_status" = "status";
