-- Vendas a Prazo: uma venda pode ser paga em vários créditos do extrato (pagamento picado em dias diferentes).
-- A coluna antiga "vendas_a_prazo"."lancamentoExtratoId" fica no banco, sem uso, pra não perder dado nem quebrar
-- a versão anterior do sistema enquanto a nova é publicada.
CREATE TABLE "vendas_a_prazo_creditos" (
    "id" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "lancamentoExtratoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendas_a_prazo_creditos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vendas_a_prazo_creditos_vendaId_lancamentoExtratoId_key" ON "vendas_a_prazo_creditos"("vendaId", "lancamentoExtratoId");
CREATE INDEX "vendas_a_prazo_creditos_lancamentoExtratoId_idx" ON "vendas_a_prazo_creditos"("lancamentoExtratoId");

ALTER TABLE "vendas_a_prazo_creditos" ADD CONSTRAINT "vendas_a_prazo_creditos_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas_a_prazo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vendas_a_prazo_creditos" ADD CONSTRAINT "vendas_a_prazo_creditos_lancamentoExtratoId_fkey" FOREIGN KEY ("lancamentoExtratoId") REFERENCES "lancamentos_extrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vínculos que já existiam (1 venda -> 1 crédito).
INSERT INTO "vendas_a_prazo_creditos" ("id", "vendaId", "lancamentoExtratoId")
SELECT 'vpc' || md5(v."id" || v."lancamentoExtratoId"), v."id", v."lancamentoExtratoId"
FROM "vendas_a_prazo" v
WHERE v."lancamentoExtratoId" IS NOT NULL
ON CONFLICT DO NOTHING;
