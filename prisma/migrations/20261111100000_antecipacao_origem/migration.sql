-- Antecipação paga por financeira (Daycoval), não pela adquirente
ALTER TABLE "antecipacoes_cartao" ADD COLUMN "origem" TEXT;
