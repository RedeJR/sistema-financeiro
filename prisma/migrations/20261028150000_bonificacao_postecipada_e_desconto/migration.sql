-- Desconto do boleto (só usado em Combustíveis a Pagar)
ALTER TABLE "contas_a_pagar" ADD COLUMN "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Bonificação Postecipada
CREATE TYPE "BandeiraCombustivel" AS ENUM ('IPIRANGA', 'VIBRA', 'SHELL');

CREATE TABLE "bonificacoes_postecipadas" (
    "id" TEXT NOT NULL,
    "bandeira" "BandeiraCombustivel" NOT NULL,
    "postoId" TEXT NOT NULL,
    "periodoDe" DATE NOT NULL,
    "periodoAte" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonificacoes_postecipadas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bonificacoes_postecipadas_postoId_periodoDe_idx" ON "bonificacoes_postecipadas"("postoId", "periodoDe");

ALTER TABLE "bonificacoes_postecipadas" ADD CONSTRAINT "bonificacoes_postecipadas_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
