-- Vendas a Prazo (cliente, período do abastecimento, valor, data de pagamento) ligadas ao extrato
CREATE TABLE "vendas_a_prazo" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "periodoDe" DATE NOT NULL,
    "periodoAte" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "dataPagamento" DATE NOT NULL,
    "observacao" TEXT,
    "lancamentoExtratoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendas_a_prazo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vendas_a_prazo_postoId_dataPagamento_idx" ON "vendas_a_prazo"("postoId", "dataPagamento");
CREATE INDEX "vendas_a_prazo_lancamentoExtratoId_idx" ON "vendas_a_prazo"("lancamentoExtratoId");

ALTER TABLE "vendas_a_prazo" ADD CONSTRAINT "vendas_a_prazo_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vendas_a_prazo" ADD CONSTRAINT "vendas_a_prazo_lancamentoExtratoId_fkey" FOREIGN KEY ("lancamentoExtratoId") REFERENCES "lancamentos_extrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
