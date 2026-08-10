-- AlterTable
ALTER TABLE "lancamentos_extrato" ADD COLUMN "contaAPagarId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_extrato_contaAPagarId_key" ON "lancamentos_extrato"("contaAPagarId");

-- AddForeignKey
ALTER TABLE "lancamentos_extrato" ADD CONSTRAINT "lancamentos_extrato_contaAPagarId_fkey" FOREIGN KEY ("contaAPagarId") REFERENCES "contas_a_pagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
