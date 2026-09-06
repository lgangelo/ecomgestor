-- Cache do resultado de "Get Attributes" (TikTok Shop) confirmado uma vez contra a conta real,
-- pra evitar depender de uma chamada ao vivo instável a cada publicação (achado do usuário: mesma
-- categoria, mesma query byte a byte, resultado diferente entre chamadas).
ALTER TABLE "category_channel_mappings" ADD COLUMN "cached_attributes" JSONB;
