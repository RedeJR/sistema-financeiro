-- CreateTable
CREATE TABLE "contas_a_pagar" (
    "id" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "planoContaId" TEXT NOT NULL,
    "dataEmissao" DATE NOT NULL,
    "dataVencimento" DATE NOT NULL,
    "numeroDocumento" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "descricao" TEXT,
    "paga" BOOLEAN NOT NULL DEFAULT false,
    "dataPagamento" DATE,
    "bancoPagamentoId" TEXT,
    "grupoParcelamentoId" TEXT,
    "numeroParcela" INTEGER,
    "totalParcelas" INTEGER,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "grupoRecorrenciaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contas_a_pagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contas_a_pagar_dataVencimento_idx" ON "contas_a_pagar"("dataVencimento");

-- CreateIndex
CREATE INDEX "contas_a_pagar_postoId_idx" ON "contas_a_pagar"("postoId");

-- CreateIndex
CREATE INDEX "contas_a_pagar_grupoRecorrenciaId_idx" ON "contas_a_pagar"("grupoRecorrenciaId");

-- AddForeignKey
ALTER TABLE "contas_a_pagar" ADD CONSTRAINT "contas_a_pagar_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_a_pagar" ADD CONSTRAINT "contas_a_pagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_a_pagar" ADD CONSTRAINT "contas_a_pagar_planoContaId_fkey" FOREIGN KEY ("planoContaId") REFERENCES "plano_de_contas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_a_pagar" ADD CONSTRAINT "contas_a_pagar_bancoPagamentoId_fkey" FOREIGN KEY ("bancoPagamentoId") REFERENCES "bancos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
