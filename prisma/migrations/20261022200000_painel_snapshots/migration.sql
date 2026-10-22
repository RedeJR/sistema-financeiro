CREATE TABLE "painel_snapshots" (
    "chave" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "painel_snapshots_pkey" PRIMARY KEY ("chave")
);
