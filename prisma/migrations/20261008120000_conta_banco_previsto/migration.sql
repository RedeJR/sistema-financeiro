-- AlterTable
ALTER TABLE "contas_a_pagar" ADD COLUMN     "bancoPrevistoId" TEXT;

-- AddForeignKey
ALTER TABLE "contas_a_pagar" ADD CONSTRAINT "contas_a_pagar_bancoPrevistoId_fkey" FOREIGN KEY ("bancoPrevistoId") REFERENCES "bancos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
