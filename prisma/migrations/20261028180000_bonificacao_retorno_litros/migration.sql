-- Bonificação Postecipada: retorno por litro (R$) e litragem comprada no período
ALTER TABLE "bonificacoes_postecipadas" ADD COLUMN "retornoPorLitro" DECIMAL(10,4) NOT NULL DEFAULT 0;
ALTER TABLE "bonificacoes_postecipadas" ADD COLUMN "litros" DECIMAL(14,2) NOT NULL DEFAULT 0;
