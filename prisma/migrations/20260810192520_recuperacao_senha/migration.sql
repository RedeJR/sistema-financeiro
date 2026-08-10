-- Esqueci minha senha: email do usuário + tokens de recuperação.

ALTER TABLE "usuarios" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

CREATE TABLE "recuperacoes_senha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperacoes_senha_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "recuperacoes_senha" ADD CONSTRAINT "recuperacoes_senha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
