import "server-only";
import { paraLista, emLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { classificarTipoFechamento, ehVendaEmDinheiro, ORDEM_TIPO_FECHAMENTO, type TipoFechamento } from "./normalizar";
import { MAQUININHAS_COM_VOUCHER } from "./vouchersDuplicados";

// Voucher passado na maquininha (Stone, Rede, PagSeguro...) é da emissora (Pluxee, VR): o fechamento mostra na linha dela,
// junto com o relatório do próprio voucher, e não na da maquininha.
function adquirenteDaVenda(t: { adquirente: { nome: string }; tipoVenda: string; bandeira: string | null }): string {
  const ehVoucherDeMaquininha = MAQUININHAS_COM_VOUCHER.includes(t.adquirente.nome) && /^voucher/i.test(t.tipoVenda.trim());
  return ehVoucherDeMaquininha && (t.bandeira === "PLUXEE" || t.bandeira === "VR") ? t.bandeira : t.adquirente.nome;
}

export type ModalidadeFechamento = TipoFechamento;

export type LinhaFechamento = {
  posto: string;
  postoId: string;
  adquirente: string;
  modalidade: ModalidadeFechamento;
  qtd: number;
  totalBruto: number;
  totalLiquido: number;
  taxa: number; // bruto − líquido, só das vendas que têm líquido
  qtdSemLiquido: number; // vendas sem líquido no arquivo (ex: VR) — ficam fora da taxa
  brutoSemLiquido: number;
};

// Fechamento de vendas por posto/adquirente/modalidade no período (data da
// venda) — bruto, líquido e taxa (bruto − líquido), sem comparar com
// extrato (isso é a aba Recebimentos). Sem postoId, traz todos os postos
// ativos agrupados (uso: fechamento do mês pra rede inteira).
export async function buscarFechamentoCartoes(params: {
  postoId?: string | string[];
  adquirenteId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<LinhaFechamento[]> {
  const { postoId, adquirenteId, dataInicio, dataFim } = params;
  const postoIds = paraLista(postoId);

  // Com adquirente escolhida, traz também os vouchers de maquininha que pertencem a ela (se for Pluxee/VR).
  const filtrada = adquirenteId ? await prisma.adquirenteCartao.findUnique({ where: { id: adquirenteId }, select: { nome: true } }) : null;
  const transacoes = await prisma.transacaoCartao.findMany({
    where: {
      dataVenda: { gte: dataInicio, lte: dataFim },
      ...emLista("postoId", postoIds),
      ...(adquirenteId
        ? {
            OR: [
              { adquirenteId },
              ...(filtrada && ["PLUXEE", "VR"].includes(filtrada.nome)
                ? [{ adquirente: { nome: { in: MAQUININHAS_COM_VOUCHER } }, tipoVenda: { startsWith: "voucher", mode: "insensitive" as const }, bandeira: filtrada.nome }]
                : []),
            ],
          }
        : {}),
    },
    include: { adquirente: true, posto: true },
  });

  const grupos = new Map<string, LinhaFechamento>();
  for (const t of transacoes) {
    const adquirenteNome = adquirenteDaVenda(t);
    if (filtrada && adquirenteNome !== filtrada.nome) continue; // voucher de maquininha que foi pra linha da emissora
    const modalidade = classificarTipoFechamento(t.tipoVenda, adquirenteNome);
    const chave = `${t.postoId}|${adquirenteNome}|${modalidade}`;
    const grupo = grupos.get(chave) ?? {
      posto: t.posto.nome,
      postoId: t.postoId,
      adquirente: adquirenteNome,
      modalidade,
      qtd: 0,
      totalBruto: 0,
      totalLiquido: 0,
      taxa: 0,
      qtdSemLiquido: 0,
      brutoSemLiquido: 0,
    };
    // Venda em dinheiro (Abastece Aí) não é venda de cartão: fica fora de qtd/bruto/líquido.
    // Só a tarifa cobrada por pagamento em dinheiro (líquido negativo no arquivo) entra na taxa.
    if (ehVendaEmDinheiro(t.tipoVenda)) {
      if (t.valorLiquido !== null && Number(t.valorLiquido) < 0) grupo.taxa += -Number(t.valorLiquido);
      grupos.set(chave, grupo);
      continue;
    }
    grupo.qtd++;
    grupo.totalBruto += Number(t.valorBruto);
    if (t.valorLiquido !== null) {
      grupo.totalLiquido += Number(t.valorLiquido);
      grupo.taxa += Number(t.valorBruto) - Number(t.valorLiquido);
    } else {
      grupo.qtdSemLiquido++;
      grupo.brutoSemLiquido += Number(t.valorBruto);
    }
    grupos.set(chave, grupo);
  }

  return [...grupos.values()].sort(
    (a, b) =>
      a.posto.localeCompare(b.posto) ||
      a.adquirente.localeCompare(b.adquirente) ||
      ORDEM_TIPO_FECHAMENTO[a.modalidade] - ORDEM_TIPO_FECHAMENTO[b.modalidade]
  );
}

export type LinhaCustoAntecipacao = {
  posto: string;
  postoId: string;
  adquirente: string;
  qtd: number;
  valorFace: number;
  valorLiquido: number;
  custo: number; // face − líquido
};

// Custo das antecipações de recebíveis (AntecipacaoCartao) recebidas no
// período — pela data em que o dinheiro caiu. Não entra no bruto − líquido das
// vendas, porque o arquivo da adquirente traz só a taxa nominal.
export async function buscarCustoAntecipacao(params: {
  postoId?: string | string[];
  adquirenteId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<LinhaCustoAntecipacao[]> {
  const { postoId, adquirenteId, dataInicio, dataFim } = params;
  const postoIds = paraLista(postoId);
  const antecipacoes = await prisma.antecipacaoCartao.findMany({
    where: {
      dataRecebimento: { gte: dataInicio, lte: dataFim },
      ...emLista("postoId", postoIds),
      ...(adquirenteId ? { adquirenteId } : {}),
    },
    include: { adquirente: true, posto: true },
  });

  const grupos = new Map<string, LinhaCustoAntecipacao>();
  for (const a of antecipacoes) {
    const chave = `${a.postoId}|${a.adquirenteId}`;
    const g = grupos.get(chave) ?? {
      posto: a.posto.nome,
      postoId: a.postoId,
      adquirente: a.adquirente.nome,
      qtd: 0,
      valorFace: 0,
      valorLiquido: 0,
      custo: 0,
    };
    g.qtd++;
    g.valorFace += Number(a.valorFace);
    g.valorLiquido += Number(a.valorLiquido);
    g.custo += Number(a.valorFace) - Number(a.valorLiquido);
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => a.posto.localeCompare(b.posto) || a.adquirente.localeCompare(b.adquirente));
}
