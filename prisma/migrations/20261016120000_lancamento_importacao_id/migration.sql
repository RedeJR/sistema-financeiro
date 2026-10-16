-- AlterTable
ALTER TABLE "lancamentos_extrato" ADD COLUMN "importacaoId" TEXT;

-- CreateIndex
CREATE INDEX "lancamentos_extrato_importacaoId_idx" ON "lancamentos_extrato"("importacaoId");
