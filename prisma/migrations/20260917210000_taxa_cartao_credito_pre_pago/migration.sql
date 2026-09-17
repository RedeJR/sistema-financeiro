ALTER TABLE "taxas_cartao" ADD COLUMN "taxaCreditoPrePago" DECIMAL(6,4);
ALTER TABLE "taxas_cartao" ADD COLUMN "prazoCreditoPrePagoDias" INTEGER NOT NULL DEFAULT 1;
