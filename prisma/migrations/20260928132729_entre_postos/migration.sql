-- CreateEnum
CREATE TYPE "TipoMovimentacaoEntrePostos" AS ENUM ('EMPRESTIMO', 'DEVOLUCAO');

-- AlterEnum
ALTER TYPE "Modulo" ADD VALUE 'ENTRE_POSTOS';

-- CreateTable
CREATE TABLE "movimentacoes_entre_postos" (
    "id" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "postoOrigemId" TEXT NOT NULL,
    "postoDestinoId" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "tipo" "TipoMovimentacaoEntrePostos" NOT NULL,
    "statusManual" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimentacoes_entre_postos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "movimentacoes_entre_postos_postoOrigemId_idx" ON "movimentacoes_entre_postos"("postoOrigemId");

-- CreateIndex
CREATE INDEX "movimentacoes_entre_postos_postoDestinoId_idx" ON "movimentacoes_entre_postos"("postoDestinoId");

-- CreateIndex
CREATE INDEX "movimentacoes_entre_postos_data_idx" ON "movimentacoes_entre_postos"("data");

-- AddForeignKey
ALTER TABLE "movimentacoes_entre_postos" ADD CONSTRAINT "movimentacoes_entre_postos_postoOrigemId_fkey" FOREIGN KEY ("postoOrigemId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_entre_postos" ADD CONSTRAINT "movimentacoes_entre_postos_postoDestinoId_fkey" FOREIGN KEY ("postoDestinoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
