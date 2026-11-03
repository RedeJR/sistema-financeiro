-- Mês de recebimento da bonificação postecipada (filtro e impressão por mês, sem depender do período)
ALTER TABLE "bonificacoes_postecipadas" ADD COLUMN "mesRecebimento" TEXT;
CREATE INDEX "bonificacoes_postecipadas_mesRecebimento_idx" ON "bonificacoes_postecipadas"("mesRecebimento");
