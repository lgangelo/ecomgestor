-- CreateEnum
CREATE TYPE "ProductExternalMaterial" AS ENUM ('COURO', 'PLASTICO');

-- AlterTable
ALTER TABLE "products" ADD COLUMN "external_material" "ProductExternalMaterial";
