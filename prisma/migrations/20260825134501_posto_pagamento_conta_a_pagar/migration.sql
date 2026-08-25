-- AlterTable
ALTER TABLE "contas_a_pagar" ADD COLUMN     "postoPagamentoId" TEXT;

-- CreateIndex
CREATE INDEX "contas_a_pagar_postoPagamentoId_idx" ON "contas_a_pagar"("postoPagamentoId");

-- AddForeignKey
ALTER TABLE "contas_a_pagar" ADD CONSTRAINT "contas_a_pagar_postoPagamentoId_fkey" FOREIGN KEY ("postoPagamentoId") REFERENCES "postos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
