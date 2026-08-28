-- AlterTable
-- CNPJ/CPF único quando preenchido (NULL não conflita com NULL no Postgres,
-- então postos/fornecedores sem documento cadastrado continuam convivendo
-- normalmente).
CREATE UNIQUE INDEX "postos_cnpj_key" ON "postos"("cnpj");

-- AlterTable
CREATE UNIQUE INDEX "fornecedores_documento_key" ON "fornecedores"("documento");
