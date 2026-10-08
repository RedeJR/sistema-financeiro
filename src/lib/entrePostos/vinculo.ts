import "server-only";
import { prisma } from "@/lib/prisma";

// Vínculo entre uma movimentação (empréstimo/devolução) e o lançamento real
// do extrato bancário — evita contar o mesmo dinheiro duas vezes (uma no
// extrato, outra em Entre Postos) e é como o sistema confirma que nada foi
// esquecido (ver comentário no schema, MovimentacaoEntrePostos).

const JANELA_DIAS = 5;
const TOLERANCIA = 0.02;

export type CandidatoLancamento = {
  id: string;
  data: Date;
  descricao: string;
  valor: number;
  categoriaNome: string | null;
  bancoNome: string;
};

// Lançamentos do posto e valor esperado (já com o sinal certo — negativo pra
// quem manda, positivo pra quem recebe) que ainda não estão vinculados a
// NENHUMA movimentação, numa janela de dias em torno da data da
// movimentação. Não filtra por categoria — o lançamento pode estar em
// "Outros" ou qualquer outra, é exatamente o que a usuária vai corrigir ao
// vincular.
async function buscarCandidatos(params: { postoId: string; data: Date; valorComSinal: string; lado: "origem" | "destino" }): Promise<CandidatoLancamento[]> {
  const { postoId, data, valorComSinal, lado } = params;
  const de = new Date(data.getTime() - JANELA_DIAS * 86400000);
  const ate = new Date(data.getTime() + JANELA_DIAS * 86400000);
  const alvo = Number(valorComSinal);

  const campoVinculo = lado === "origem" ? "movimentacoesEntrePostosOrigem" : "movimentacoesEntrePostosDestino";
  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      postoId,
      data: { gte: de, lte: ate },
      valor: { gte: (alvo - TOLERANCIA).toFixed(2), lte: (alvo + TOLERANCIA).toFixed(2) },
      [campoVinculo]: { none: {} },
    },
    include: { categoria: true, banco: true },
    orderBy: { data: "asc" },
  });
  return lancamentos.map((l) => ({
    id: l.id,
    data: l.data,
    descricao: l.descricao,
    valor: Number(l.valor),
    categoriaNome: l.categoria?.nome ?? null,
    bancoNome: l.banco.nome,
  }));
}

export async function sugerirCandidatosVinculo(movimentacaoId: string): Promise<{
  origemCandidatos: CandidatoLancamento[];
  destinoCandidatos: CandidatoLancamento[];
}> {
  const mov = await prisma.movimentacaoEntrePostos.findUniqueOrThrow({ where: { id: movimentacaoId } });
  const valor = Number(mov.valor);
  const [origemCandidatos, destinoCandidatos] = await Promise.all([
    mov.lancamentoExtratoOrigemId
      ? []
      : buscarCandidatos({ postoId: mov.postoOrigemId, data: mov.data, valorComSinal: (-valor).toFixed(2), lado: "origem" }),
    mov.lancamentoExtratoDestinoId
      ? []
      : buscarCandidatos({ postoId: mov.postoDestinoId, data: mov.data, valorComSinal: valor.toFixed(2), lado: "destino" }),
  ]);
  return { origemCandidatos, destinoCandidatos };
}

const CATEGORIA_ENTRE_POSTOS_NOME = "ENTRE POSTOS";

// Vincula e recategoriza o lançamento pra "ENTRE POSTOS" — assim ele some de
// "Outros" (ou onde estivesse) e passa a refletir certo no Fechamento de
// Extratos, sem duplicar com o total da movimentação.
export async function vincularLancamento(params: { movimentacaoId: string; lado: "origem" | "destino"; lancamentoExtratoId: string }) {
  const { movimentacaoId, lado, lancamentoExtratoId } = params;
  const categoria = await prisma.categoriaExtrato.findUniqueOrThrow({ where: { nome: CATEGORIA_ENTRE_POSTOS_NOME } });
  await prisma.$transaction([
    prisma.movimentacaoEntrePostos.update({
      where: { id: movimentacaoId },
      data:
        lado === "origem"
          ? { lancamentoExtratoOrigemId: lancamentoExtratoId }
          : { lancamentoExtratoDestinoId: lancamentoExtratoId },
    }),
    prisma.lancamentoExtrato.update({ where: { id: lancamentoExtratoId }, data: { categoriaId: categoria.id } }),
  ]);
}

// Desfaz o vínculo — não mexe na categoria do lançamento (pode ter sido
// ajustada por outro motivo depois; se a usuária quiser, recategoriza na
// tela de Editar Extrato como qualquer outra linha).
export async function desvincularLancamento(params: { movimentacaoId: string; lado: "origem" | "destino" }) {
  const { movimentacaoId, lado } = params;
  await prisma.movimentacaoEntrePostos.update({
    where: { id: movimentacaoId },
    data: lado === "origem" ? { lancamentoExtratoOrigemId: null } : { lancamentoExtratoDestinoId: null },
  });
}

// ---------------------------------------------------------------------------
// Vínculo automático (pedido da usuária em 08/10/2026: "ele já não faz o
// vínculo sozinho?"). Mesmo espírito conservador da conciliação de
// combustíveis: só liga quando NÃO há dúvida — o lançamento tem que ser o
// único candidato da movimentação E a movimentação a única dona dele. Se
// houver mais de um candidato (dois repasses de mesmo valor no mesmo posto,
// por exemplo) ou nenhum, deixa pra ela na tela de Vincular.
//
// Passada 1: 1-pra-1 (posto, valor com o sinal certo, janela de JANELA_DIAS).
// Passada 2 (só entre lançamentos que ela já categorizou como ENTRE POSTOS,
// pra não inventar soma com PIX qualquer do dia): um repasse que o banco dividiu em vários Pix no mesmo dia
// (movimentação = soma de lançamentos) ou vários repasses do mesmo dia que
// saíram num Pix só (lançamento = soma de movimentações) — só quando existe
// exatamente UMA combinação que fecha a soma. Como cada movimentação aponta
// pra 1 lançamento por lado (ver schema), no primeiro caso o vínculo vai pro
// maior dos Pix e os demais só são recategorizados; no segundo, as
// movimentações apontam todas pro mesmo lançamento.

type Slot = { movId: string; lado: "origem" | "destino"; postoId: string; data: Date; alvo: number };
type Lanc = { id: string; postoId: string; data: Date; valor: number; categoriaId: string | null };

const DIA_MS = 86400000;

// Subconjuntos (tamanho >= 2) de `itens` cuja soma bate com `alvo` — com
// assinatura de valores distinta, pra dois Pix de mesmo valor não contarem
// como duas combinações diferentes. Limitado a 14 itens (busca exaustiva).
function combinacoesQueSomam<T extends { id: string }>(itens: T[], valorDe: (i: T) => number, alvo: number): T[][] {
  if (itens.length < 2 || itens.length > 14) return [];
  const porAssinatura = new Map<string, T[]>();
  for (let mascara = 1; mascara < 1 << itens.length; mascara++) {
    const escolhidos = itens.filter((_, i) => mascara & (1 << i));
    if (escolhidos.length < 2) continue;
    const soma = escolhidos.reduce((s, i) => s + valorDe(i), 0);
    if (Math.abs(soma - alvo) > 0.005) continue;
    const assinatura = escolhidos.map((i) => valorDe(i).toFixed(2)).sort().join(",");
    if (!porAssinatura.has(assinatura)) porAssinatura.set(assinatura, escolhidos);
  }
  return [...porAssinatura.values()];
}

export async function rodarVinculoAutomaticoEntrePostos(): Promise<{ vinculos: number }> {
  const [categoria, movs] = await Promise.all([
    prisma.categoriaExtrato.findUnique({ where: { nome: CATEGORIA_ENTRE_POSTOS_NOME } }),
    prisma.movimentacaoEntrePostos.findMany({
      where: { OR: [{ lancamentoExtratoOrigemId: null }, { lancamentoExtratoDestinoId: null }] },
    }),
  ]);
  if (!categoria || movs.length === 0) return { vinculos: 0 };

  const slots: Slot[] = [];
  for (const m of movs) {
    const v = Number(m.valor);
    if (!m.lancamentoExtratoOrigemId) slots.push({ movId: m.id, lado: "origem", postoId: m.postoOrigemId, data: m.data, alvo: -v });
    if (!m.lancamentoExtratoDestinoId) slots.push({ movId: m.id, lado: "destino", postoId: m.postoDestinoId, data: m.data, alvo: v });
  }

  const tempos = slots.map((s) => s.data.getTime());
  const lancamentos: Lanc[] = (
    await prisma.lancamentoExtrato.findMany({
      where: {
        postoId: { in: [...new Set(slots.map((s) => s.postoId))] },
        data: { gte: new Date(Math.min(...tempos) - JANELA_DIAS * DIA_MS), lte: new Date(Math.max(...tempos) + JANELA_DIAS * DIA_MS) },
        contaAPagarId: null,
        movimentacoesEntrePostosOrigem: { none: {} },
        movimentacoesEntrePostosDestino: { none: {} },
      },
      select: { id: true, postoId: true, data: true, valor: true, categoriaId: true },
    })
  ).map((l) => ({ id: l.id, postoId: l.postoId, data: l.data, valor: Number(l.valor), categoriaId: l.categoriaId }));

  // Pix "irmãos" de um repasse já vinculado só por parte do valor (ex: 202.000
  // saiu em 127.000 + 75.000 e o vínculo ficou no maior): o menor não aponta
  // pra movimentação nenhuma (só há 1 vínculo por lado), então numa próxima
  // rodada ele pareceria livre e podia ser "roubado" por outra movimentação
  // de mesmo valor. Fica reservado.
  const jaVinculadas = await prisma.movimentacaoEntrePostos.findMany({
    where: {
      OR: [{ lancamentoExtratoOrigemId: { not: null } }, { lancamentoExtratoDestinoId: { not: null } }],
      data: { gte: new Date(Math.min(...tempos) - 30 * DIA_MS), lte: new Date(Math.max(...tempos) + 30 * DIA_MS) },
    },
    include: { lancamentoExtratoOrigem: true, lancamentoExtratoDestino: true },
  });
  const lancsUsados = new Set<string>();
  for (const m of jaVinculadas) {
    for (const l of [m.lancamentoExtratoOrigem, m.lancamentoExtratoDestino]) {
      if (!l || Math.abs(Math.abs(Number(l.valor)) - Number(m.valor)) <= TOLERANCIA) continue;
      for (const x of lancamentos) {
        if (x.postoId === l.postoId && Math.sign(x.valor) === Math.sign(Number(l.valor)) && Math.abs(x.data.getTime() - m.data.getTime()) <= DIA_MS) {
          lancsUsados.add(x.id);
        }
      }
    }
  }
  const slotsResolvidos = new Set<Slot>();
  const ligacoes: { slot: Slot; lancId: string }[] = [];
  const recategorizar = new Set<string>();

  // Passada 1 — 1 pra 1, exigindo unicidade nos dois sentidos, e 1b —
  // desempate por data (mesmo valor e posto em dias próximos, ex: empréstimo
  // de 20.000 num dia e devolução de 20.000 três dias depois): só liga quando
  // o par é o MAIS PRÓXIMO inequívoco dos dois lados (sem empate de
  // distância); repete até não sobrar par assim.
  //
  // Roda duas vezes: primeiro só com lançamentos de até 1 dia de diferença,
  // depois (já com as somas da passada 2 resolvidas) com a janela cheia. Sem
  // essa ordem, um Pix de 75.000 que era metade de um repasse de 202.000 do
  // dia 02 era "roubado" por uma devolução de 75.000 do dia 07 — o único
  // candidato dentro da janela, mas claramente a coisa errada.
  const passadaUnicos = (janelaMs: number) => {
    const dist = (s: Slot, l: Lanc) => Math.abs(l.data.getTime() - s.data.getTime());
    const candidatosDoSlot = new Map<Slot, Lanc[]>();
    const slotsDoLanc = new Map<string, Slot[]>();
    for (const s of slots) {
      if (slotsResolvidos.has(s)) continue;
      const cands = lancamentos.filter(
        (l) => !lancsUsados.has(l.id) && l.postoId === s.postoId && Math.abs(l.valor - s.alvo) <= TOLERANCIA && dist(s, l) <= janelaMs
      );
      candidatosDoSlot.set(s, cands);
      for (const l of cands) slotsDoLanc.set(l.id, [...(slotsDoLanc.get(l.id) ?? []), s]);
    }
    const ligar = (s: Slot, l: Lanc) => {
      ligacoes.push({ slot: s, lancId: l.id });
      lancsUsados.add(l.id);
      slotsResolvidos.add(s);
      recategorizar.add(l.id);
    };
    for (const s of slots) {
      const cands = (candidatosDoSlot.get(s) ?? []).filter((l) => !lancsUsados.has(l.id));
      if (slotsResolvidos.has(s) || cands.length !== 1) continue;
      if ((slotsDoLanc.get(cands[0].id) ?? []).length !== 1) continue;
      ligar(s, cands[0]);
    }
    for (let achou = true; achou; ) {
      achou = false;
      const abertos = slots.filter((s) => !slotsResolvidos.has(s));
      for (const s of abertos) {
        if (slotsResolvidos.has(s)) continue;
        const cands = (candidatosDoSlot.get(s) ?? []).filter((l) => !lancsUsados.has(l.id));
        if (cands.length === 0) continue;
        const ordenados = [...cands].sort((a, b) => dist(s, a) - dist(s, b));
        if (ordenados.length > 1 && dist(s, ordenados[0]) === dist(s, ordenados[1])) continue;
        const l = ordenados[0];
        const concorrentes = abertos
          .filter((o) => !slotsResolvidos.has(o) && (candidatosDoSlot.get(o) ?? []).some((c) => c.id === l.id))
          .sort((a, b) => dist(a, l) - dist(b, l));
        if (concorrentes[0] !== s) continue;
        if (concorrentes.length > 1 && dist(concorrentes[1], l) === dist(s, l)) continue;
        ligar(s, l);
        achou = true;
      }
    }
  };

  passadaUnicos(DIA_MS);

  // Passada 2 — somas. Agrupa por posto + lado + dia da movimentação.
  const grupos = new Map<string, Slot[]>();
  for (const s of slots) {
    if (slotsResolvidos.has(s)) continue;
    const k = `${s.postoId}|${s.lado}|${s.data.toISOString().slice(0, 10)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), s]);
  }
  for (const grupo of grupos.values()) {
    const { postoId, data, alvo } = grupo[0];
    const sinal = alvo < 0 ? -1 : 1;
    const doDia = () =>
      lancamentos.filter(
        (l) => l.postoId === postoId && l.categoriaId === categoria.id && !lancsUsados.has(l.id) && Math.sign(l.valor) === sinal && Math.abs(l.data.getTime() - data.getTime()) <= DIA_MS
      );

    // (a) uma movimentação = vários Pix do banco
    for (const s of grupo) {
      if (slotsResolvidos.has(s)) continue;
      const combos = combinacoesQueSomam(doDia(), (l) => Math.abs(l.valor), Math.abs(s.alvo));
      if (combos.length !== 1) continue;
      const principal = [...combos[0]].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))[0];
      ligacoes.push({ slot: s, lancId: principal.id });
      slotsResolvidos.add(s);
      for (const l of combos[0]) {
        lancsUsados.add(l.id);
        recategorizar.add(l.id);
      }
    }

    // (b) um Pix do banco = várias movimentações
    for (const l of doDia()) {
      if (lancsUsados.has(l.id)) continue;
      const pendentes = grupo.filter((s) => !slotsResolvidos.has(s));
      const itens = pendentes.map((s) => ({ id: `${s.movId}|${s.lado}`, s }));
      const combos = combinacoesQueSomam(itens, (i) => Math.abs(i.s.alvo), Math.abs(l.valor));
      if (combos.length !== 1) continue;
      for (const item of combos[0]) {
        ligacoes.push({ slot: item.s, lancId: l.id });
        slotsResolvidos.add(item.s);
      }
      lancsUsados.add(l.id);
      recategorizar.add(l.id);
    }
  }

  passadaUnicos(JANELA_DIAS * DIA_MS);

  if (ligacoes.length === 0) return { vinculos: 0 };

  await prisma.$transaction(
    [
      ...ligacoes.map(({ slot, lancId }) =>
        prisma.movimentacaoEntrePostos.update({
          where: { id: slot.movId },
          data: slot.lado === "origem" ? { lancamentoExtratoOrigemId: lancId } : { lancamentoExtratoDestinoId: lancId },
        })
      ),
      prisma.lancamentoExtrato.updateMany({ where: { id: { in: [...recategorizar] } }, data: { categoriaId: categoria.id } }),
    ],
    { timeout: 60000, maxWait: 15000 }
  );

  return { vinculos: ligacoes.length };
}
