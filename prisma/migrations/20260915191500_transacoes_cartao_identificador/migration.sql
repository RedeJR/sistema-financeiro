-- AlterTable
ALTER TABLE "transacoes_cartao" ADD COLUMN "identificadorExterno" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_cartao_postoId_adquirenteId_identificadorExterno_key" ON "transacoes_cartao"("postoId", "adquirenteId", "identificadorExterno");
