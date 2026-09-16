-- CreateTable
CREATE TABLE "transacoes_cartao" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "adquirenteId" TEXT NOT NULL,
    "dataVenda" DATE NOT NULL,
    "horaVenda" TEXT NOT NULL DEFAULT '',
    "tipoVenda" TEXT NOT NULL,
    "valorBruto" DECIMAL(12,2) NOT NULL,
    "taxaRs" DECIMAL(12,2),
    "valorLiquido" DECIMAL(12,2),
    "dataPagamento" DATE,
    "arquivoOrigem" TEXT NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacoes_cartao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transacoes_cartao_postoId_dataVenda_idx" ON "transacoes_cartao"("postoId", "dataVenda");

-- CreateIndex
CREATE INDEX "transacoes_cartao_adquirenteId_dataPagamento_idx" ON "transacoes_cartao"("adquirenteId", "dataPagamento");

-- CreateIndex
CREATE UNIQUE INDEX "transacoes_cartao_postoId_adquirenteId_dataVenda_horaVenda__key" ON "transacoes_cartao"("postoId", "adquirenteId", "dataVenda", "horaVenda", "valorBruto", "tipoVenda");

-- AddForeignKey
ALTER TABLE "transacoes_cartao" ADD CONSTRAINT "transacoes_cartao_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_cartao" ADD CONSTRAINT "transacoes_cartao_adquirenteId_fkey" FOREIGN KEY ("adquirenteId") REFERENCES "adquirentes_cartao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
