-- DropIndex
-- (bancoId,fitid) tratava o banco (instituição) como escopo de unicidade do
-- FITID, mas o FITID só é garantidamente único dentro de UMA conta bancária
-- real. Dois postos diferentes com conta no mesmo banco têm sequências de
-- FITID independentes, que podem coincidir por acaso — nesse caso o
-- lançamento do segundo posto importado era descartado como "duplicata" do
-- primeiro, mesmo sendo uma transação real e distinta.
DROP INDEX "lancamentos_extrato_bancoId_fitid_key";

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_extrato_postoId_bancoId_fitid_key" ON "lancamentos_extrato"("postoId", "bancoId", "fitid");
