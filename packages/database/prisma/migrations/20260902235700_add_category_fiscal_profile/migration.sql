-- CreateTable
CREATE TABLE "category_fiscal_profiles" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "ncm" TEXT NOT NULL,
    "cest" TEXT,
    "ex_tipi" TEXT,
    "natureza_operacao" TEXT NOT NULL,
    "cfop_intraestadual" TEXT NOT NULL,
    "cfop_interestadual" TEXT NOT NULL,
    "pis_cofins_code" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "csosn" TEXT NOT NULL,
    "unidade_medida" TEXT NOT NULL,
    "recopi" TEXT,
    "ficha_conteudo_importacao" TEXT,
    "aliquota_aproximada" DECIMAL(5,2),
    "dados_adicionais" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "category_fiscal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_fiscal_profiles_category_id_channel_type_key" ON "category_fiscal_profiles"("category_id", "channel_type");

-- AddForeignKey
ALTER TABLE "category_fiscal_profiles" ADD CONSTRAINT "category_fiscal_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_fiscal_profiles" ADD CONSTRAINT "category_fiscal_profiles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
