-- DropIndex
-- (postoId,bancoId,fitid) ainda não bastava: Banco do Brasil reusa o mesmo
-- FITID pra toda ocorrência de certos lançamentos recorrentes (ex: "Cielo
-- Vendas Crédito", "BB Rende Fácil" — FITID idêntico em dezenas de dias
-- diferentes, valores diferentes). Sem data+valor na constraint, cada
-- ocorrência depois da primeira seria descartada como duplicata.
DROP INDEX "lancamentos_extrato_postoId_bancoId_fitid_key";

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_extrato_postoId_bancoId_fitid_data_valor_key" ON "lancamentos_extrato"("postoId", "bancoId", "fitid", "data", "valor");
