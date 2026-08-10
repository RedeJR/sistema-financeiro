-- AlterTable
ALTER TABLE "lancamentos_extrato" ADD COLUMN "fitid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_extrato_bancoId_fitid_key" ON "lancamentos_extrato"("bancoId", "fitid");
