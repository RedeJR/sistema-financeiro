-- AlterTable
ALTER TABLE "movimentacoes_entre_postos" ADD COLUMN     "lancamentoExtratoDestinoId" TEXT,
ADD COLUMN     "lancamentoExtratoOrigemId" TEXT;

-- AddForeignKey
ALTER TABLE "movimentacoes_entre_postos" ADD CONSTRAINT "movimentacoes_entre_postos_lancamentoExtratoOrigemId_fkey" FOREIGN KEY ("lancamentoExtratoOrigemId") REFERENCES "lancamentos_extrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentacoes_entre_postos" ADD CONSTRAINT "movimentacoes_entre_postos_lancamentoExtratoDestinoId_fkey" FOREIGN KEY ("lancamentoExtratoDestinoId") REFERENCES "lancamentos_extrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
