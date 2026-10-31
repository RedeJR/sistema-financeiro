-- Bandeira do cartão em cada venda (conferência de taxas por bandeira)
ALTER TABLE "transacoes_cartao" ADD COLUMN "bandeira" TEXT;
