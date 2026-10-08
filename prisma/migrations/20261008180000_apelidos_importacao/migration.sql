-- CreateEnum
CREATE TYPE "TipoApelidoImportacao" AS ENUM ('POSTO', 'FORNECEDOR', 'PLANO_CONTA');

-- CreateTable
CREATE TABLE "apelidos_importacao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoApelidoImportacao" NOT NULL,
    "texto" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apelidos_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apelidos_importacao_tipo_texto_key" ON "apelidos_importacao"("tipo", "texto");
