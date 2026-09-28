-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "bloqueadoAte" TIMESTAMP(3),
ADD COLUMN     "tentativasFalhasLogin" INTEGER NOT NULL DEFAULT 0;
