-- Combustíveis a Pagar: novo módulo (aba separada de Contas a Pagar) com
-- baixa automática via conciliação bancária.

-- Novo valor de permissão por módulo.
ALTER TYPE "Modulo" ADD VALUE 'COMBUSTIVEIS_A_PAGAR';

-- Campos novos em contas_a_pagar: `combustivel` marca as linhas desse novo
-- fluxo (baixa automática, plano de contas fixo); `dataDescarga` é
-- informativo (não entra no casamento com o extrato).
ALTER TABLE "contas_a_pagar" ADD COLUMN "combustivel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contas_a_pagar" ADD COLUMN "dataDescarga" DATE;
