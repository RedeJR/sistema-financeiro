-- CreateTable
CREATE TABLE "fluxo_caixa_dias" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "saldoInicial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "recebimentos" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "despesasExtras" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fluxo_caixa_dias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fluxo_caixa_dias_data_idx" ON "fluxo_caixa_dias"("data");

-- CreateIndex
CREATE UNIQUE INDEX "fluxo_caixa_dias_postoId_data_key" ON "fluxo_caixa_dias"("postoId", "data");

-- AddForeignKey
ALTER TABLE "fluxo_caixa_dias" ADD CONSTRAINT "fluxo_caixa_dias_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

