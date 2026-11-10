import "server-only";
import { prisma } from "@/lib/prisma";

// Controle de transferências entre contas: cada saída de uma conta tem que ter a entrada correspondente em outra
// conta do MESMO posto. O que sobra sem par é dinheiro que entrou (ou saiu) por uma conta que o sistema não
// conhece — ex: o extrato do Daycoval, onde cai a antecipação de recebíveis antes de ser transferida pras contas
// principais. Sem esse controle, esse dinheiro vira "transferência entre contas" (neutra) e o crédito continua
// aparecendo como "a receber" na adquirente.

export const CATEGORIA_TRANSFERENCIA = "TRANSF. ENTRE CONTAS";
export const CATEGORIA_ANTECIPACAO_DAYCOVAL = "ANTECIPAÇÃO DAYCOVAL";

const JANELA_DIAS = 3;
const TOLERANCIA = 0.02;
const DIA_MS = 86400000;

export type LinhaTransferencia = {
  id: string;
  data: Date;
  postoId: string;
  postoNome: string;
  bancoId: string;
  bancoNome: string;
  descricao: string;
  valor: number; // positivo = entrada, negativo = saída
  observacao: string | null;
};

export type ParTransferencia = { saidas: LinhaTransferencia[]; entradas: LinhaTransferencia[] };

export type ResumoTransferenciasPosto = {
  postoId: string;
  postoNome: string;
  totalEntradas: number;
  totalSaidas: number;
  pares: ParTransferencia[];
  valorPareado: number;
  entradasSemPar: LinhaTransferencia[];
  saidasSemPar: LinhaTransferencia[];
  somaEntradasSemPar: number;
  somaSaidasSemPar: number;
  antecipacoes: LinhaTransferencia[];
  somaAntecipacoes: number;
};

const arred = (v: number) => Math.round(v * 100) / 100;

// Subconjuntos (tamanho 2 a 6) cuja soma de valores absolutos bate com `alvo` — com assinatura de valores
// distinta, pra duas linhas de mesmo valor não contarem como duas combinações diferentes. Limitado a 14 itens.
function combinacoesQueSomam(itens: LinhaTransferencia[], alvo: number): LinhaTransferencia[][] {
  if (itens.length < 2 || itens.length > 14) return [];
  const porAssinatura = new Map<string, LinhaTransferencia[]>();
  for (let mascara = 1; mascara < 1 << itens.length; mascara++) {
    const escolhidos = itens.filter((_, i) => mascara & (1 << i));
    if (escolhidos.length < 2 || escolhidos.length > 6) continue;
    const soma = escolhidos.reduce((s, l) => s + Math.abs(l.valor), 0);
    if (Math.abs(soma - alvo) > TOLERANCIA) continue;
    const assinatura = escolhidos.map((l) => Math.abs(l.valor).toFixed(2)).sort().join(",");
    if (!porAssinatura.has(assinatura)) porAssinatura.set(assinatura, escolhidos);
  }
  return [...porAssinatura.values()];
}

// Casa as entradas com as saídas de UM posto. Passada 1: 1 pra 1 (mesmo valor, bancos diferentes, até 3 dias de
// diferença, a mais próxima). Passada 2: uma saída = várias entradas (ou o contrário), só quando existe
// exatamente UMA combinação que fecha a soma — sem dúvida, igual ao vínculo automático do Entre Postos.
export function casarTransferencias(linhas: LinhaTransferencia[]): { pares: ParTransferencia[]; entradasSemPar: LinhaTransferencia[]; saidasSemPar: LinhaTransferencia[] } {
  const entradas = linhas.filter((l) => l.valor > 0).sort((a, b) => a.data.getTime() - b.data.getTime());
  const saidas = linhas.filter((l) => l.valor < 0).sort((a, b) => a.data.getTime() - b.data.getTime());
  const usados = new Set<string>();
  const pares: ParTransferencia[] = [];
  const perto = (a: LinhaTransferencia, b: LinhaTransferencia) => Math.abs(a.data.getTime() - b.data.getTime()) <= JANELA_DIAS * DIA_MS;

  for (const e of entradas) {
    let melhor: LinhaTransferencia | null = null;
    for (const s of saidas) {
      // Mesmo banco vale: um posto pode ter duas contas no mesmo banco (ex: Cantareira, conta de cartões e conta
      // corrente no Bradesco) e a transferência entre elas aparece no mesmo extrato.
      if (usados.has(s.id) || !perto(s, e)) continue;
      if (Math.abs(Math.abs(s.valor) - e.valor) > TOLERANCIA) continue;
      if (!melhor || Math.abs(s.data.getTime() - e.data.getTime()) < Math.abs(melhor.data.getTime() - e.data.getTime())) melhor = s;
    }
    if (melhor) {
      usados.add(e.id);
      usados.add(melhor.id);
      pares.push({ entradas: [e], saidas: [melhor] });
    }
  }

  for (const s of saidas) {
    if (usados.has(s.id)) continue;
    const candidatas = entradas.filter((e) => !usados.has(e.id) && perto(e, s));
    const combos = combinacoesQueSomam(candidatas, Math.abs(s.valor));
    if (combos.length !== 1) continue;
    usados.add(s.id);
    combos[0].forEach((e) => usados.add(e.id));
    pares.push({ entradas: combos[0], saidas: [s] });
  }
  for (const e of entradas) {
    if (usados.has(e.id)) continue;
    const candidatas = saidas.filter((s) => !usados.has(s.id) && perto(s, e));
    const combos = combinacoesQueSomam(candidatas, e.valor);
    if (combos.length !== 1) continue;
    usados.add(e.id);
    combos[0].forEach((s) => usados.add(s.id));
    pares.push({ entradas: [e], saidas: combos[0] });
  }

  // Passada 3 — soma do dia: uma saída que é o total de TODAS as entradas ainda sem par na janela (ex: o repasse de
  // fim de dia da conta de cartões, que no extrato da conta corrente chega em vários Pix pequenos). Só quando a soma
  // fecha exata; é um sinal forte, mesmo com muitas entradas (a passada 2 só olha combinações de até 14).
  for (const s of saidas) {
    if (usados.has(s.id)) continue;
    const livres = entradas.filter((e) => !usados.has(e.id) && perto(e, s) && e.data.getTime() >= s.data.getTime() - DIA_MS);
    if (livres.length < 2) continue;
    const soma = livres.reduce((t, e) => t + e.valor, 0);
    if (Math.abs(soma - Math.abs(s.valor)) > TOLERANCIA) continue;
    usados.add(s.id);
    livres.forEach((e) => usados.add(e.id));
    pares.push({ entradas: livres, saidas: [s] });
  }

  return {
    pares,
    entradasSemPar: entradas.filter((e) => !usados.has(e.id)),
    saidasSemPar: saidas.filter((s) => !usados.has(s.id)),
  };
}

// Transferências de um mês (por posto). Busca também 3 dias além das pontas do mês, só pra poder casar uma saída
// do dia 30 com a entrada do dia 2; o que aparece como "sem par" é sempre só do mês pedido.
// Postos cadastrados separados que, pro controle de transferências, são "o mesmo posto": o dinheiro que passa de um
// pro outro é transferência entre contas (não empréstimo), então as transferências deles são casadas em conjunto.
// Paris recebe do Oliveira (CNPJ à parte, mesmo dono e operação).
export const GRUPOS_DE_POSTOS: string[][] = [["OLIVEIRA", "PARIS"]];

export async function analisarTransferencias(params: { ano: number; mes: number; postoIds?: string[] }): Promise<ResumoTransferenciasPosto[]> {
  const { ano, mes, postoIds } = params;
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0));
  const categorias = await prisma.categoriaExtrato.findMany({ where: { nome: { in: [CATEGORIA_TRANSFERENCIA, CATEGORIA_ANTECIPACAO_DAYCOVAL] } }, select: { id: true, nome: true } });
  const idTransf = categorias.find((c) => c.nome === CATEGORIA_TRANSFERENCIA)?.id;
  const idAntecipacao = categorias.find((c) => c.nome === CATEGORIA_ANTECIPACAO_DAYCOVAL)?.id;
  if (!idTransf && !idAntecipacao) return [];

  const todosPostos = await prisma.posto.findMany({ select: { id: true, nome: true } });
  const grupoDe = (nome: string) => GRUPOS_DE_POSTOS.find((g) => g.includes(nome));
  const chaveDe = (postoId: string, nome: string) => {
    const g = grupoDe(nome);
    return g ? `grupo:${g.join("+")}` : postoId;
  };
  // Filtrar um posto de um grupo traz o grupo inteiro (o par pode estar no outro posto).
  const idsFiltro = postoIds && postoIds.length
    ? [...new Set(postoIds.flatMap((id) => {
        const nome = todosPostos.find((p) => p.id === id)?.nome;
        const g = nome ? grupoDe(nome) : undefined;
        return g ? todosPostos.filter((p) => g.includes(p.nome)).map((p) => p.id) : [id];
      }))]
    : undefined;

  const brutas = await prisma.lancamentoExtrato.findMany({
    where: {
      categoriaId: { in: [idTransf, idAntecipacao].filter((x): x is string => !!x) },
      data: { gte: new Date(inicio.getTime() - JANELA_DIAS * DIA_MS), lte: new Date(fim.getTime() + JANELA_DIAS * DIA_MS) },
      ...(idsFiltro ? { postoId: { in: idsFiltro } } : {}),
    },
    include: { posto: { select: { nome: true } }, banco: { select: { nome: true } } },
    orderBy: [{ data: "asc" }, { valor: "asc" }],
  });

  const porPosto = new Map<string, { transf: (LinhaTransferencia & { categoriaId: string | null })[]; antecipacoes: LinhaTransferencia[] }>();
  for (const l of brutas) {
    const linha = {
      id: l.id,
      data: l.data,
      postoId: l.postoId,
      postoNome: l.posto.nome,
      bancoId: l.bancoId,
      bancoNome: l.banco.nome,
      descricao: l.descricao,
      valor: Number(l.valor),
      observacao: l.observacao,
    };
    const chave = chaveDe(l.postoId, l.posto.nome);
    const g = porPosto.get(chave) ?? { transf: [], antecipacoes: [] };
    if (l.categoriaId === idAntecipacao) {
      if (l.data >= inicio && l.data <= fim) g.antecipacoes.push(linha);
    } else {
      g.transf.push({ ...linha, categoriaId: l.categoriaId });
    }
    porPosto.set(chave, g);
  }

  const resultado: ResumoTransferenciasPosto[] = [];
  for (const [chave, g] of porPosto) {
    const grupo = chave.startsWith("grupo:") ? GRUPOS_DE_POSTOS.find((x) => `grupo:${x.join("+")}` === chave) : undefined;
    const postoId = grupo ? (todosPostos.find((p) => p.nome === grupo[0])?.id ?? chave) : chave;
    const { pares, entradasSemPar, saidasSemPar } = casarTransferencias(g.transf);
    const noMes = (l: LinhaTransferencia) => l.data >= inicio && l.data <= fim;
    const paresDoMes = pares.filter((p) => [...p.entradas, ...p.saidas].some(noMes));
    const doMes = g.transf.filter(noMes);
    const semParEntradas = entradasSemPar.filter(noMes);
    const semParSaidas = saidasSemPar.filter(noMes);
    resultado.push({
      postoId,
      postoNome: grupo ? grupo.join(" + ") : (g.transf[0]?.postoNome ?? g.antecipacoes[0]?.postoNome ?? "—"),
      totalEntradas: arred(doMes.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)),
      totalSaidas: arred(doMes.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0)),
      pares: paresDoMes,
      valorPareado: arred(paresDoMes.reduce((s, p) => s + p.entradas.reduce((x, e) => x + e.valor, 0), 0)),
      entradasSemPar: semParEntradas,
      saidasSemPar: semParSaidas,
      somaEntradasSemPar: arred(semParEntradas.reduce((s, l) => s + l.valor, 0)),
      somaSaidasSemPar: arred(semParSaidas.reduce((s, l) => s + l.valor, 0)),
      antecipacoes: g.antecipacoes,
      somaAntecipacoes: arred(g.antecipacoes.reduce((s, l) => s + l.valor, 0)),
    });
  }
  return resultado.sort((a, b) => a.postoNome.localeCompare(b.postoNome));
}
