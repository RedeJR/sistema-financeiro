-- AlterTable
ALTER TABLE "plano_de_contas" ADD COLUMN "codigo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "plano_de_contas_codigo_key" ON "plano_de_contas"("codigo");

-- CreateTable
CREATE TABLE "lancamentos_extrato_divisoes" (
    "id" TEXT NOT NULL,
    "lancamentoExtratoId" TEXT NOT NULL,
    "categoriaId" TEXT,
    "tipoAdquirente" "TipoLancamentoAdquirente",
    "valor" DECIMAL(12,2) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamentos_extrato_divisoes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "lancamentos_extrato_divisoes" ADD CONSTRAINT "lancamentos_extrato_divisoes_lancamentoExtratoId_fkey" FOREIGN KEY ("lancamentoExtratoId") REFERENCES "lancamentos_extrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_extrato_divisoes" ADD CONSTRAINT "lancamentos_extrato_divisoes_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_extrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
