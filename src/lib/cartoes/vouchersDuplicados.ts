import "server-only";
import { prisma } from "@/lib/prisma";

// Adquirentes de voucher cujo relatório traz o repasse verdadeiro (prazo e
// taxa). A mesma venda também aparece no relatório da maquininha que a
// capturou, com tipo "voucher ..." (Rede, PagSeguro, Stone) ou "Auto"
// (Cielo) — mas quem paga é o voucher, não a maquininha.
const VOUCHERS = ["VR", "ALELO", "PLUXEE"];
export const MAQUININHAS_COM_VOUCHER = ["CIELO", "REDE", "STONE", "GETNET", "PAGSEGURO"];

const TIPO_VOUCHER_NA_MAQUININHA = `(m."tipoVenda" ILIKE '%voucher%' OR (ma.nome = 'CIELO' AND m."tipoVenda" = 'Auto'))`;

// Pra cada venda de voucher (VR/Alelo/Pluxee) com par na maquininha (mesmo
// posto, data e valor — e hora quando o voucher informa), apaga a linha de
// voucher da maquininha, uma pra uma. Fica só a do relatório do voucher, que
// é a que tem o repasse certo. Sem par (voucher que não temos relatório,
// ex: Stone/Sinergia), a linha da maquininha fica. Devolve quantas apagou.
export async function removerVouchersDuplicadosDasMaquininhas(postoIds?: string[]): Promise<number> {
  const filtroPosto = postoIds && postoIds.length > 0 ? `AND t."postoId" = ANY($1::text[])` : "";
  const parametros = postoIds && postoIds.length > 0 ? [postoIds] : [];

  let apagadas = 0;
  for (const comHora of [true, false]) {
    const chaveHora = comHora ? `AND m."horaVenda" = v."horaVenda"` : "";
    const filtroHoraVoucher = comHora ? `t."horaVenda" <> ''` : `t."horaVenda" = ''`;
    const sql = `
      WITH v AS (
        SELECT t."postoId", t."dataVenda", t."horaVenda", t."valorBruto", count(*) AS n
        FROM transacoes_cartao t JOIN adquirentes_cartao a ON a.id = t."adquirenteId"
        WHERE a.nome = ANY(ARRAY[${VOUCHERS.map((n) => `'${n}'`).join(",")}]) AND ${filtroHoraVoucher} ${filtroPosto}
        GROUP BY 1,2,3,4
      ), m AS (
        SELECT m.id, m."postoId", m."dataVenda", m."horaVenda", m."valorBruto",
               row_number() OVER (PARTITION BY m."postoId", m."dataVenda", ${comHora ? `m."horaVenda",` : ""} m."valorBruto" ORDER BY m.id) AS rn
        FROM transacoes_cartao m JOIN adquirentes_cartao ma ON ma.id = m."adquirenteId"
        WHERE ma.nome = ANY(ARRAY[${MAQUININHAS_COM_VOUCHER.map((n) => `'${n}'`).join(",")}]) AND ${TIPO_VOUCHER_NA_MAQUININHA}
          ${postoIds && postoIds.length > 0 ? `AND m."postoId" = ANY($1::text[])` : ""}
      ), alvo AS (
        SELECT m.id FROM m JOIN v ON v."postoId" = m."postoId" AND v."dataVenda" = m."dataVenda" AND v."valorBruto" = m."valorBruto" ${chaveHora}
        WHERE m.rn <= v.n
      )
      DELETE FROM transacoes_cartao WHERE id IN (SELECT id FROM alvo)`;
    apagadas += await prisma.$executeRawUnsafe(sql, ...parametros);
  }
  return apagadas;
}

// Quando o mesmo relatório (mesmas vendas) já foi importado em outro posto:
// arquivo de posto único nunca é igual em dois postos, então é engano de
// posto selecionado na tela. Devolve o nome do outro posto, ou null.
export async function postoQueJaTemAsMesmasVendas(params: {
  postoId: string;
  adquirenteId: string;
  identificadores: string[];
}): Promise<string | null> {
  const { postoId, adquirenteId, identificadores } = params;
  if (identificadores.length < 5) return null;

  const passo = Math.max(1, Math.floor(identificadores.length / 300));
  const amostra = identificadores.filter((_, i) => i % passo === 0).slice(0, 300);

  const grupos = await prisma.transacaoCartao.groupBy({
    by: ["postoId"],
    where: { adquirenteId, postoId: { not: postoId }, identificadorExterno: { in: amostra } },
    _count: { _all: true },
  });
  const maior = grupos.sort((a, b) => b._count._all - a._count._all)[0];
  if (!maior || maior._count._all < amostra.length * 0.5) return null;

  const posto = await prisma.posto.findUnique({ where: { id: maior.postoId }, select: { nome: true } });
  return posto?.nome ?? null;
}
