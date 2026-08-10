-- DropIndex
-- A constraint composta (postoId,bancoId,data,descricao,valor) causava
-- falso-positivo: transações distintas legítimas com mesma data+descrição+
-- valor no mesmo dia (ex: 3 tarifas bancárias iguais, 2 PIX iguais pro mesmo
-- favorecido) colidiam e eram descartadas como "duplicata" na importação.
-- Dedup por (data,descrição,valor) agora roda em código, só entre linhas sem
-- FITID — ver src/lib/extratos/importar.ts.
DROP INDEX "lancamentos_extrato_postoId_bancoId_data_descricao_valor_key";
