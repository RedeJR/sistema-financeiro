-- CreateEnum
CREATE TYPE "TipoLancamentoAdquirente" AS ENUM ('DEBITO', 'CREDITO');

-- AlterTable
ALTER TABLE "lancamentos_extrato" ADD COLUMN     "tipoAdquirente" "TipoLancamentoAdquirente";
