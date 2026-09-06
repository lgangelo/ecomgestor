-- CreateTable
CREATE TABLE "category_channel_mappings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "external_category_id" TEXT NOT NULL,
    "external_category_version" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "category_channel_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_channel_mappings_category_id_channel_type_key" ON "category_channel_mappings"("category_id", "channel_type");

-- AddForeignKey
ALTER TABLE "category_channel_mappings" ADD CONSTRAINT "category_channel_mappings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_channel_mappings" ADD CONSTRAINT "category_channel_mappings_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
