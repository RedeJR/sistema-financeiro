-- Campo separado de "descricao": informação de apoio pra quem for lançar o
-- pagamento no banco (dados bancários, desconto/acréscimo, senha de boleto
-- etc), editável em Contas a Pagar e mostrada como tooltip em Conferência
-- Diária.
ALTER TABLE "contas_a_pagar" ADD COLUMN "observacao" TEXT;
