-- Acerto entre postos: devolução (Entre Postos) ligada ao combustível a pagar que ela quitou
ALTER TABLE "movimentacoes_entre_postos" ADD COLUMN "contaAPagarId" TEXT;
CREATE INDEX "movimentacoes_entre_postos_contaAPagarId_idx" ON "movimentacoes_entre_postos"("contaAPagarId");
ALTER TABLE "movimentacoes_entre_postos" ADD CONSTRAINT "movimentacoes_entre_postos_contaAPagarId_fkey" FOREIGN KEY ("contaAPagarId") REFERENCES "contas_a_pagar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
