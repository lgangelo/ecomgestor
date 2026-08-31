-- Busca de produtos usa "contains" (LIKE '%termo%') em nome, SKU base e agora tambem SKU de
-- variacao (adicionado para achar variacoes cujo SKU nao deriva do SKU base) - um indice btree
-- comum (o unique de products.sku ja existente) nao acelera esse padrao, so match exato ou
-- prefixo. pg_trgm + GIN e a solucao padrao do Postgres para "contains" ficar rapido mesmo com o
-- catalogo crescendo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "products_base_sku_trgm_idx" ON "products" USING GIN ("base_sku" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "product_variants_sku_trgm_idx" ON "product_variants" USING GIN ("sku" gin_trgm_ops);
