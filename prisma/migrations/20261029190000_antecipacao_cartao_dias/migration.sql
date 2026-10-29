-- Valor antecipado dia a dia (arquivo "Negociação de recebíveis" da Cielo)
CREATE TABLE "antecipacoes_cartao_dias" (
    "id" TEXT NOT NULL,
    "antecipacaoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "antecipacoes_cartao_dias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "antecipacoes_cartao_dias_antecipacaoId_data_key" ON "antecipacoes_cartao_dias"("antecipacaoId", "data");
ALTER TABLE "antecipacoes_cartao_dias" ADD CONSTRAINT "antecipacoes_cartao_dias_antecipacaoId_fkey" FOREIGN KEY ("antecipacaoId") REFERENCES "antecipacoes_cartao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
