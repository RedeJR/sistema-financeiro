import "server-only";
import { prisma } from "@/lib/prisma";
import { classificarModalidadeVenda, ORDEM_MODALIDADE_VENDA, type ModalidadeVenda } from "./normalizar";

export type ModalidadeFechamento = ModalidadeVenda;

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
  postoId?: string;
  adquirenteId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<LinhaFechamento[]> {
  const { postoId, adquirenteId, dataInicio, dataFim } = params;

  const transacoes = await prisma.transacaoCartao.findMany({
    where: {
      dataVenda: { gte: dataInicio, lte: dataFim },
      ...(postoId ? { postoId } : {}),
      ...(adquirenteId ? { adquirenteId } : {}),
    },
    include: { adquirente: true, posto: true },
  });

  const grupos = new Map<string, LinhaFechamento>();
  for (const t of transacoes) {
    const modalidade = classificarModalidadeVenda(t.tipoVenda, t.adquirente.nome);
    const chave = `${t.postoId}|${t.adquirenteId}|${modalidade}`;
    const grupo = grupos.get(chave) ?? {
      posto: t.posto.nome,
      postoId: t.postoId,
      adquirente: t.adquirente.nome,
      modalidade,
      qtd: 0,
      totalBruto: 0,
      totalLiquido: 0,
      taxa: 0,
      qtdSemLiquido: 0,
      brutoSemLiquido: 0,
    };
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
      ORDEM_MODALIDADE_VENDA[a.modalidade] - ORDEM_MODALIDADE_VENDA[b.modalidade]
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
  postoId?: string;
  adquirenteId?: string;
  dataInicio: Date;
  dataFim: Date;
}): Promise<LinhaCustoAntecipacao[]> {
  const { postoId, adquirenteId, dataInicio, dataFim } = params;
  const antecipacoes = await prisma.antecipacaoCartao.findMany({
    where: {
      dataRecebimento: { gte: dataInicio, lte: dataFim },
      ...(postoId ? { postoId } : {}),
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
