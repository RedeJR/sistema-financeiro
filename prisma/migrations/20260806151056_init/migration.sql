-- CreateEnum
CREATE TYPE "TipoPlanoConta" AS ENUM ('ADQUIRENTE', 'PADRAO');

-- CreateTable
CREATE TABLE "postos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bancos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigoArquivo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bancos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_conta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPlanoConta" NOT NULL DEFAULT 'PADRAO',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_conta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "postos_nome_key" ON "postos"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "bancos_nome_key" ON "bancos"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "bancos_codigoArquivo_key" ON "bancos"("codigoArquivo");

-- CreateIndex
CREATE UNIQUE INDEX "planos_conta_nome_key" ON "planos_conta"("nome");
