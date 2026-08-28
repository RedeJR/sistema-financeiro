-- CreateEnum
CREATE TYPE "FrequenciaRecorrencia" AS ENUM ('MENSAL', 'SEMANAL');

-- AlterTable
ALTER TABLE "contas_a_pagar" ADD COLUMN     "diasSemanaRecorrencia" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "frequenciaRecorrencia" "FrequenciaRecorrencia";

