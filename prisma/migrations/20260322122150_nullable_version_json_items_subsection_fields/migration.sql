/*
  Warnings:

  - The `items` column on the `Section` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Change" ALTER COLUMN "patchVersion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PatchNote" ALTER COLUMN "version" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Section" DROP COLUMN "items",
ADD COLUMN     "items" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Subsection" ADD COLUMN     "description" TEXT,
ADD COLUMN     "items" JSONB;
