-- CreateTable
CREATE TABLE "lancamentos_extrato" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "bancoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "saldoExtrato" DECIMAL(12,2),
    "categoriaId" TEXT,
    "observacao" TEXT,
    "arquivoOrigem" TEXT NOT NULL,
    "importadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamentos_extrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_extrato_postoId_bancoId_data_descricao_valor_key" ON "lancamentos_extrato"("postoId", "bancoId", "data", "descricao", "valor");

-- AddForeignKey
ALTER TABLE "lancamentos_extrato" ADD CONSTRAINT "lancamentos_extrato_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_extrato" ADD CONSTRAINT "lancamentos_extrato_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "bancos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_extrato" ADD CONSTRAINT "lancamentos_extrato_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_extrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_extrato" ADD CONSTRAINT "lancamentos_extrato_importadoPorId_fkey" FOREIGN KEY ("importadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
