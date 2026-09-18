-- CreateEnum
CREATE TYPE "StatusConferenciaCaixa" AS ENUM ('PENDENTE', 'CONFERIDO', 'DIVERGENTE');

-- CreateTable
CREATE TABLE "conferencias_caixa" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "valorTotal" DECIMAL(12,2) NOT NULL,
    "status" "StatusConferenciaCaixa" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conferencias_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conferencias_caixa_postoId_inicio_fim_key" ON "conferencias_caixa"("postoId", "inicio", "fim");

-- AddForeignKey
ALTER TABLE "conferencias_caixa" ADD CONSTRAINT "conferencias_caixa_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "transacoes_cartao_postoId_adquirenteId_dataVenda_horaVenda_idx" RENAME TO "transacoes_cartao_postoId_adquirenteId_dataVenda_horaVenda__idx";
