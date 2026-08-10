-- Posto: novo campo CNPJ (opcional)
ALTER TABLE "postos" ADD COLUMN "cnpj" TEXT;

-- Renomeia a antiga "PlanoConta" (lista plana de categorias de extrato) para
-- "CategoriaExtrato" — libera o nome "PlanoConta" para o plano de contas
-- contábil de verdade (Grupo -> Conta), que é uma coisa diferente.
ALTER TYPE "TipoPlanoConta" RENAME TO "TipoCategoriaExtrato";
ALTER TABLE "planos_conta" RENAME TO "categorias_extrato";
ALTER TABLE "categorias_extrato" RENAME CONSTRAINT "planos_conta_pkey" TO "categorias_extrato_pkey";
ALTER INDEX "planos_conta_nome_key" RENAME TO "categorias_extrato_nome_key";

-- Plano de Contas contábil (Sistema 2 - Contas a Pagar): estrutura em duas
-- camadas, Grupo -> Conta.
CREATE TABLE "grupos_plano_conta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_plano_conta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "grupos_plano_conta_nome_key" ON "grupos_plano_conta"("nome");

CREATE TABLE "plano_de_contas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "grupoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plano_de_contas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plano_de_contas_grupoId_nome_key" ON "plano_de_contas"("grupoId", "nome");

ALTER TABLE "plano_de_contas" ADD CONSTRAINT "plano_de_contas_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_plano_conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
