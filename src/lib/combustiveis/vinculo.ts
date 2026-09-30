import "server-only";
import { prisma } from "@/lib/prisma";

// Vínculo manual entre uma Combustível a Pagar e um ou mais lançamentos do
// extrato — pedido da usuária em 28/09/2026: a conciliação automática (ver
// rodarConciliacaoAutomaticaCombustiveis em src/lib/conciliacao.ts) já
// tenta achar sozinha até pagamentos "picados" (vários débitos do mesmo dia
// somando o valor da conta), mas só quando o resultado é inequívoco. Um
// pagamento picado em dias diferentes, ou dividido junto de outra conta de
// valor diferente no mesmo dia, ela não arrisca sozinha — fica pra usuária
// escolher aqui à mão.
//
// Busca de candidatos NÃO filtra por posto (mudança pedida em 29/09/2026):
// é comum um posto pagar combustível de outro pelo próprio banco (boleto
// dividido, adiantamento entre postos), e a usuária já confere manualmente
// se é combustível antes de vincular — pedir que o lançamento esteja na
// conta bancária "certa" só atrapalhava. A categoria "Combustíveis" (a não
// ser que `todasCategorias`) e o valor batendo já bastam; `postoNome`
// devolvido junto pra ela ver de qual posto veio o dinheiro antes de
// confirmar.

const TOLERANCIA = 0.01;

export type CandidatoLancamentoCombustivel = {
  id: string;
  data: Date;
  descricao: string;
  valor: number; // sempre negativo (débito)
  categoriaNome: string | null;
  bancoNome: string;
  postoNome: string;
};

export async function buscarCandidatosCombustivel(params: {
  contaId: string;
  dataInicio: Date;
  dataFim: Date;
  todasCategorias: boolean;
}): Promise<CandidatoLancamentoCombustivel[]> {
  const { dataInicio, dataFim, todasCategorias } = params;

  const categoriaCombustiveis = todasCategorias
    ? null
    : await prisma.categoriaExtrato.findUnique({ where: { nome: "COMBUSTÍVEIS" } });

  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      contaAPagarId: null,
      valor: { lt: 0 },
      data: { gte: dataInicio, lte: dataFim },
      ...(categoriaCombustiveis ? { categoriaId: categoriaCombustiveis.id } : {}),
    },
    include: { categoria: true, banco: true, posto: true },
    orderBy: { data: "asc" },
  });
  return lancamentos.map((l) => ({
    id: l.id,
    data: l.data,
    descricao: l.descricao,
    valor: Number(l.valor),
    categoriaNome: l.categoria?.nome ?? null,
    bancoNome: l.banco.nome,
    postoNome: l.posto.nome,
  }));
}

export type LancamentoVinculadoCombustivel = CandidatoLancamentoCombustivel;

export async function buscarVinculadosCombustivel(contaId: string): Promise<LancamentoVinculadoCombustivel[]> {
  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: { contaAPagarId: contaId },
    include: { categoria: true, banco: true, posto: true },
    orderBy: { data: "asc" },
  });
  return lancamentos.map((l) => ({
    id: l.id,
    data: l.data,
    descricao: l.descricao,
    valor: Number(l.valor),
    categoriaNome: l.categoria?.nome ?? null,
    bancoNome: l.banco.nome,
    postoNome: l.posto.nome,
  }));
}

// Vincula os lançamentos escolhidos à conta e recalcula: se a soma de TODOS
// os lançamentos vinculados (os novos + os que já estavam) bater com o
// valor da conta, dá baixa nela (paga=true, dataPagamento = data do
// lançamento mais recente vinculado, bancoPagamentoId = banco desse mesmo
// lançamento) — igual a conciliação automática faz. Não bate ainda (parcial)
// só vincula e deixa em aberto, pra ela ir completando aos poucos.
//
// `lancamentoExtrato.contaAPagarId` é um campo escalar (uma linha só tem UM
// valor nele) — estruturalmente já é impossível um lançamento pertencer a
// duas contas ao mesmo tempo. O `where: { contaAPagarId: null }` abaixo é a
// segunda trava: só assume um lançamento que ainda esteja livre, nunca toma
// de outra conta — cobre o caso de duas pessoas tentarem vincular o mesmo
// lançamento quase ao mesmo tempo (a segunda simplesmente não consegue
// pegar o que a primeira já pegou, em vez de roubar).
export async function vincularLancamentosCombustivel(params: {
  contaId: string;
  lancamentoIds: string[];
}): Promise<{ paga: boolean; somaVinculada: number; valorConta: number; idsJaUsadosPorOutraConta: string[] }> {
  const { contaId, lancamentoIds } = params;
  const conta = await prisma.contaAPagar.findUniqueOrThrow({ where: { id: contaId }, select: { valor: true } });

  let idsJaUsadosPorOutraConta: string[] = [];
  if (lancamentoIds.length > 0) {
    // `valor: { lt: 0 }` de novo aqui (já vale lá em cima, na lista de
    // candidatos) — trava no ponto que grava de verdade, pra uma entrada
    // (crédito) nunca poder ser contada como pagamento de combustível,
    // mesmo que o id venha de fora da tela normal. Achado real (28/09/2026):
    // um PIX recebido bateu por coincidência com o valor de uma conta —
    // não chegou a ser vinculado (a lista de candidatos já não mostra
    // crédito), mas essa trava garante isso também na escrita.
    const resultado = await prisma.lancamentoExtrato.updateMany({
      where: { id: { in: lancamentoIds }, contaAPagarId: null, valor: { lt: 0 } },
      data: { contaAPagarId: contaId },
    });
    if (resultado.count < lancamentoIds.length) {
      // Algum dos selecionados já não estava mais livre (outra conta pegou
      // primeiro), já estava vinculado a essa mesma conta, ou era um
      // crédito (barrado pela trava acima) — avisa quais, em vez de falhar
      // calado. Filtra em JS, não com `NOT: { contaAPagarId: contaId }` no
      // Prisma: em SQL, `<> valor` não bate linha com NULL (lógica de três
      // valores), então um lançamento nunca vinculado (contaAPagarId NULL)
      // ficava de fora dessa lista por engano — bug real, achado em teste.
      const todosSelecionados = await prisma.lancamentoExtrato.findMany({
        where: { id: { in: lancamentoIds } },
        select: { id: true, contaAPagarId: true },
      });
      idsJaUsadosPorOutraConta = todosSelecionados.filter((l) => l.contaAPagarId !== contaId).map((l) => l.id);
    }
  }

  const baixa = await recalcularBaixaCombustivel(contaId, Number(conta.valor));
  return { ...baixa, idsJaUsadosPorOutraConta };
}

export async function desvincularLancamentoCombustivel(params: { contaId: string; lancamentoId: string }): Promise<{ paga: boolean; somaVinculada: number; valorConta: number }> {
  const { contaId, lancamentoId } = params;
  const conta = await prisma.contaAPagar.findUniqueOrThrow({ where: { id: contaId }, select: { valor: true } });

  await prisma.lancamentoExtrato.update({ where: { id: lancamentoId }, data: { contaAPagarId: null } });

  return recalcularBaixaCombustivel(contaId, Number(conta.valor));
}

async function recalcularBaixaCombustivel(contaId: string, valorConta: number): Promise<{ paga: boolean; somaVinculada: number; valorConta: number }> {
  const vinculados = await prisma.lancamentoExtrato.findMany({ where: { contaAPagarId: contaId }, select: { valor: true, data: true, bancoId: true } });
  const somaVinculada = vinculados.reduce((s, l) => s + Math.abs(Number(l.valor)), 0);
  const bate = vinculados.length > 0 && Math.abs(somaVinculada - valorConta) <= TOLERANCIA;

  if (bate) {
    const maisRecente = vinculados.reduce((a, b) => (b.data > a.data ? b : a));
    await prisma.contaAPagar.update({
      where: { id: contaId },
      data: { paga: true, dataPagamento: maisRecente.data, bancoPagamentoId: maisRecente.bancoId },
    });
  } else {
    // Deixa (ou volta a deixar) em aberto — não mexe em postoPagamentoId,
    // que é escolhido pela própria usuária no cadastro, não pela
    // conciliação (diferente de Despesas Pagas, que reseta tudo junto).
    await prisma.contaAPagar.update({
      where: { id: contaId },
      data: { paga: false, dataPagamento: null, bancoPagamentoId: null },
    });
  }

  return { paga: bate, somaVinculada, valorConta };
}
