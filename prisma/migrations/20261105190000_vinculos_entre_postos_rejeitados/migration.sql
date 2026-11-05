-- Vínculos entre postos desfeitos à mão: o vínculo automático não religa o mesmo par
CREATE TABLE "vinculos_entre_postos_rejeitados" (
    "id" TEXT NOT NULL,
    "movimentacaoId" TEXT NOT NULL,
    "lancamentoExtratoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculos_entre_postos_rejeitados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vinculos_entre_postos_rejeitados_movimentacaoId_lancamentoExtratoId_key" ON "vinculos_entre_postos_rejeitados"("movimentacaoId", "lancamentoExtratoId");
CREATE INDEX "vinculos_entre_postos_rejeitados_lancamentoExtratoId_idx" ON "vinculos_entre_postos_rejeitados"("lancamentoExtratoId");

ALTER TABLE "vinculos_entre_postos_rejeitados" ADD CONSTRAINT "vinculos_entre_postos_rejeitados_movimentacaoId_fkey" FOREIGN KEY ("movimentacaoId") REFERENCES "movimentacoes_entre_postos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vinculos_entre_postos_rejeitados" ADD CONSTRAINT "vinculos_entre_postos_rejeitados_lancamentoExtratoId_fkey" FOREIGN KEY ("lancamentoExtratoId") REFERENCES "lancamentos_extrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
