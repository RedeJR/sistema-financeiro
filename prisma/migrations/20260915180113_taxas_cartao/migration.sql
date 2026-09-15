-- CreateTable
CREATE TABLE "adquirentes_cartao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adquirentes_cartao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxas_cartao" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "adquirenteId" TEXT NOT NULL,
    "taxaDebito" DECIMAL(6,4),
    "prazoDebitoDias" INTEGER NOT NULL DEFAULT 1,
    "taxaCreditoVista" DECIMAL(6,4),
    "prazoCreditoVistaDias" INTEGER NOT NULL DEFAULT 1,
    "taxaCreditoParcelado" DECIMAL(6,4),
    "prazoCreditoParceladoDias" INTEGER NOT NULL DEFAULT 30,
    "domicilioBancoId" TEXT,
    "observacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "taxas_cartao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adquirentes_cartao_nome_key" ON "adquirentes_cartao"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "taxas_cartao_postoId_adquirenteId_key" ON "taxas_cartao"("postoId", "adquirenteId");

-- AddForeignKey
ALTER TABLE "taxas_cartao" ADD CONSTRAINT "taxas_cartao_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxas_cartao" ADD CONSTRAINT "taxas_cartao_adquirenteId_fkey" FOREIGN KEY ("adquirenteId") REFERENCES "adquirentes_cartao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxas_cartao" ADD CONSTRAINT "taxas_cartao_domicilioBancoId_fkey" FOREIGN KEY ("domicilioBancoId") REFERENCES "bancos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
