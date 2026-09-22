-- CreateTable
CREATE TABLE "antecipacoes_cartao" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "adquirenteId" TEXT NOT NULL,
    "dataRecebimento" DATE NOT NULL,
    "periodoDe" DATE NOT NULL,
    "periodoAte" DATE NOT NULL,
    "valorFace" DECIMAL(12,2) NOT NULL,
    "valorLiquido" DECIMAL(12,2) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "antecipacoes_cartao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "antecipacoes_cartao_postoId_dataRecebimento_idx" ON "antecipacoes_cartao"("postoId", "dataRecebimento");

-- AddForeignKey
ALTER TABLE "antecipacoes_cartao" ADD CONSTRAINT "antecipacoes_cartao_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "antecipacoes_cartao" ADD CONSTRAINT "antecipacoes_cartao_adquirenteId_fkey" FOREIGN KEY ("adquirenteId") REFERENCES "adquirentes_cartao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
