CREATE TABLE "saldos_bancarios" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "bancoId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "arquivoOrigem" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saldos_bancarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saldos_bancarios_postoId_bancoId_data_key" ON "saldos_bancarios"("postoId", "bancoId", "data");

ALTER TABLE "saldos_bancarios" ADD CONSTRAINT "saldos_bancarios_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saldos_bancarios" ADD CONSTRAINT "saldos_bancarios_bancoId_fkey" FOREIGN KEY ("bancoId") REFERENCES "bancos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
