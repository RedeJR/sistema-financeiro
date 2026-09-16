-- DropIndex
DROP INDEX "transacoes_cartao_postoId_adquirenteId_dataVenda_horaVenda__key";

-- CreateIndex
CREATE INDEX "transacoes_cartao_postoId_adquirenteId_dataVenda_horaVenda_idx" ON "transacoes_cartao"("postoId", "adquirenteId", "dataVenda", "horaVenda", "valorBruto", "tipoVenda");
