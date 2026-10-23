import "server-only";
import { prisma } from "@/lib/prisma";

export const MESES_PT = [
  "",
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Port de aba2_fechamento.py: soma os lançamentos JÁ categorizados por
// dia x categoria, num único posto e mês, com saldo acumulado. Lançamentos
// sem categoria ficam de fora da soma (não dá pra fechar sem saber onde
// entram) — o total deles vem em `semCategoria`, pra usuária resolver antes
// ou decidir gerar mesmo assim.
//
// Diferença do protótipo: lá "Cielo Débito"/"Cielo Crédito" eram duas
// categorias que precisavam ser somadas numa coluna só (categoria_bd_para_fechamento).
// Aqui isso já vem de graça — débito/crédito de adquirente são a MESMA
// categoria (campo tipoAdquirente separado), então basta uma coluna por
// categoria, sem merge nenhum.
//
// Também não tem coluna de saldo do banco / "confere" (o CSV antigo do
// Bradesco trazia saldo por linha; OFX não traz saldo por dia, só o saldo
// final do período) — decisão da usuária, PROJETO ainda não cobre isso.

export type LinhaFechamento = {
  dia: number;
  porCategoria: number[]; // mesmo índice de `categorias`
  semCategoria: number; // movimento do dia ainda sem categoria (entra no saldo, pra ele bater com o banco)
  saldoAcumulado: number;
};

// Detalhamento lançamento-a-lançamento de uma categoria específica (ver
// DETALHE_NOME abaixo) — a coluna do fechamento só mostra o total do dia,
// isso aqui é o "de onde veio cada valor" que a usuária pediu pra Outros e
// Venda a Prazo. `observacao` é o texto que ela mesma digita na tela de
// revisão (/extratos/editar), não a descrição crua do banco — cai pra "" só
// quando ela ainda não anotou nada nessa linha.
export type LinhaDetalhe = {
  dia: number;
  data: Date;
  valor: number;
  observacao: string;
  descricaoBanco: string;
};

export type ResultadoFechamento = {
  postoNome: string;
  bancoNome: string;
  ano: number;
  mes: number;
  ultimoDia: number;
  categorias: { id: string; nome: string }[];
  linhas: LinhaFechamento[];
  totalPorCategoria: number[];
  totalGeral: number;
  saldoInicial: number;
  // De onde veio o saldo inicial: digitado pela usuária, saldo do banco do mês anterior, ou calculado a partir de um saldo posterior.
  saldoInicialOrigem: "INFORMADO" | "BANCO_MES_ANTERIOR" | "BANCO_POSTERIOR" | "NENHUM";
  saldoInicialObs: string;
  saldoFinal: number; // saldo inicial + TODO o movimento do mês (categorizado ou não)
  // Conferência com o saldo que o banco informou no arquivo OFX (mais recente dentro do mês).
  saldoBanco: { data: Date; valor: number; calculado: number; diferenca: number; conferidoPorVoce: boolean } | null;
  totalSemCategoria: number; // soma do que ainda está sem categoria no mês
  semCategoria: number;
  // Uma entrada por categoria em DETALHE_NOME que exista no cadastro (ver
  // abaixo) — nome da categoria -> linhas do mês, mais recente por último.
  detalhes: { categoriaNome: string; linhas: LinhaDetalhe[] }[];
};

// Categorias que ganham aba de detalhamento (data/valor/observação) no
// fechamento, além do total por dia — pedido da usuária pra conseguir ver de
// onde vem cada valor de "Outros" e "Venda a Prazo" sem abrir a tela de
// Conciliação de Extratos e catar linha por linha.
const DETALHE_NOME = ["OUTROS", "VENDA A PRAZO"];

export async function gerarFechamento(params: {
  postoId: string;
  bancoId: string;
  ano: number;
  mes: number; // 1-12
  // Não informado = automático: vem do saldo que o banco mandou no arquivo (ver SaldoBancario).
  saldoInicial?: number;
  // Colunas de categoria sem nenhum lançamento no mês ficam de fora do
  // resultado (tabela e export) por padrão — pedido da usuária, uma tela com
  // 30 colunas em branco não ajuda a ler o fechamento. Passe false pra ver
  // todas as categorias ativas, movimentadas ou não.
  somenteComMovimento?: boolean;
}): Promise<ResultadoFechamento> {
  const { postoId, bancoId, ano, mes, saldoInicial: saldoInicialInformado, somenteComMovimento = true } = params;

  const [posto, banco] = await Promise.all([
    prisma.posto.findUniqueOrThrow({ where: { id: postoId } }),
    prisma.banco.findUniqueOrThrow({ where: { id: bancoId } }),
  ]);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 0)); // dia 0 do mês seguinte = último dia deste mês
  const ultimoDia = fim.getUTCDate();

  // `ordem` sozinho empata entre categorias (ver categorias-extrato/actions.ts,
  // que agora evita empate NOVO — mas os já existentes continuam até alguém
  // editar aquela categoria). `nome` como desempate garante pelo menos uma
  // ordem ESTÁVEL entre uma geração do relatório e outra, mesmo enquanto
  // ainda existir empate de verdade no cadastro.
  const categoriasTodas = await prisma.categoriaExtrato.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  const idxPorCategoria = new Map(categoriasTodas.map((c, i) => [c.id, i]));

  const [lancamentos, divisoes, semCategoriaLinhas] = await Promise.all([
    // `divisoes: { none: {} }` é essencial aqui — um lançamento dividido às
    // vezes também acaba com categoriaId preenchido no registro principal
    // (ex: sobra de antes de ser dividido, ou um categoriaId setado por
    // engano por cima). Sem esse filtro, esse lançamento entra CONTADO EM
    // DOBRO: uma vez aqui pelo categoriaId, outra vez pela soma das divisões
    // logo abaixo — foi exatamente isso que aconteceu com um lançamento da
    // SINERGIA em 2026-08-28 (ver histórico). Divisões são sempre a fonte de
    // verdade quando existem (ver comentário no schema, ContaAPagar.divisoes).
    prisma.lancamentoExtrato.findMany({
      where: { postoId, bancoId, data: { gte: inicio, lte: fim }, categoriaId: { not: null }, divisoes: { none: {} } },
      select: { data: true, valor: true, categoriaId: true },
    }),
    // Lançamentos DIVIDIDOS (ver LancamentoExtratoDivisao) não têm categoriaId
    // no registro principal — a categoria/valor de cada um mora aqui, uma
    // linha por parte. Busca junto pra somar por (dia, categoria) igual aos
    // lançamentos normais.
    prisma.lancamentoExtratoDivisao.findMany({
      where: { lancamentoExtrato: { postoId, bancoId, data: { gte: inicio, lte: fim } } },
      select: { valor: true, categoriaId: true, lancamentoExtrato: { select: { data: true } } },
    }),
    prisma.lancamentoExtrato.findMany({
      where: { postoId, bancoId, data: { gte: inicio, lte: fim }, categoriaId: null, divisoes: { none: {} } },
      select: { data: true, valor: true },
    }),
  ]);
  const semCategoriaPorDia = new Array<number>(ultimoDia + 1).fill(0);
  for (const l of semCategoriaLinhas) semCategoriaPorDia[l.data.getUTCDate()] += Number(l.valor);
  const totalSemCategoria = semCategoriaPorDia.reduce((s, v) => s + v, 0);

  // soma[dia][índiceCategoria] — sobre TODAS as categorias ativas primeiro;
  // o corte pras só-com-movimento acontece depois de somar, senão não dá
  // pra saber quem teve movimento.
  const soma: number[][] = Array.from({ length: ultimoDia + 1 }, () => new Array(categoriasTodas.length).fill(0));
  for (const l of lancamentos) {
    const dia = l.data.getUTCDate();
    const idx = idxPorCategoria.get(l.categoriaId as string);
    if (idx === undefined) continue;
    soma[dia][idx] += Number(l.valor);
  }
  for (const d of divisoes) {
    if (!d.categoriaId) continue;
    const dia = d.lancamentoExtrato.data.getUTCDate();
    const idx = idxPorCategoria.get(d.categoriaId);
    if (idx === undefined) continue;
    soma[dia][idx] += Number(d.valor);
  }

  const totalPorCategoriaTodas = categoriasTodas.map((_, i) =>
    Array.from({ length: ultimoDia }, (_, d) => soma[d + 1][i]).reduce((s, v) => s + v, 0)
  );

  // Índices das categorias que sobrevivem no resultado final — todas, ou só
  // as com algum valor não-zero em algum dia do mês (checa dia a dia, não só
  // o total: uma categoria com +100 num dia e -100 noutro tem total 0 mas
  // teve movimento de verdade).
  const indicesFinais = categoriasTodas
    .map((_, i) => i)
    .filter((i) => {
      if (!somenteComMovimento) return true;
      for (let dia = 1; dia <= ultimoDia; dia++) {
        if (Math.round(soma[dia][i] * 100) !== 0) return true;
      }
      return false;
    });

  const categorias = indicesFinais.map((i) => ({ id: categoriasTodas[i].id, nome: categoriasTodas[i].nome }));

  // ---- saldo inicial: digitado, ou descoberto a partir do saldo que o banco mandou no arquivo ----
  const somaMovimento = async (depoisDe: Date, ate: Date): Promise<number> => {
    if (ate <= depoisDe) return 0;
    const r = await prisma.lancamentoExtrato.aggregate({
      where: { postoId, bancoId, data: { gt: depoisDe, lte: ate } },
      _sum: { valor: true },
    });
    return Number(r._sum.valor ?? 0);
  };
  const diaAnterior = new Date(inicio.getTime() - 86400000);
  const saldosBanco = await prisma.saldoBancario.findMany({ where: { postoId, bancoId }, orderBy: { data: "asc" } });
  const antes = [...saldosBanco].filter((s) => s.data <= diaAnterior).pop();
  const noMesOuDepois = saldosBanco.find((s) => s.data >= inicio);
  const ddmm = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "UTC" });

  let saldoInicial = saldoInicialInformado ?? 0;
  let saldoInicialOrigem: ResultadoFechamento["saldoInicialOrigem"] = "NENHUM";
  let saldoInicialObs = "Sem saldo do banco guardado pra esse posto/banco — digite o saldo inicial ou reimporte o extrato mais recente.";
  if (saldoInicialInformado !== undefined) {
    saldoInicialOrigem = "INFORMADO";
    saldoInicialObs = "Informado por você.";
  } else if (antes) {
    saldoInicial = Number(antes.saldo) + (await somaMovimento(antes.data, diaAnterior));
    saldoInicialOrigem = "BANCO_MES_ANTERIOR";
    const quem = antes.arquivoOrigem === "MANUAL" ? "Saldo cadastrado por você" : "Saldo do banco";
    saldoInicialObs =
      antes.data.getTime() === diaAnterior.getTime()
        ? `${quem} em ${ddmm(antes.data)} (fim do mês anterior).`
        : `${quem} em ${ddmm(antes.data)} somado ao movimento até o fim do mês anterior.`;
  } else if (noMesOuDepois) {
    saldoInicial = Number(noMesOuDepois.saldo) - (await somaMovimento(diaAnterior, noMesOuDepois.data));
    saldoInicialOrigem = "BANCO_POSTERIOR";
    saldoInicialObs = `Calculado de trás pra frente a partir do saldo do banco em ${ddmm(noMesOuDepois.data)} — sem saldo do mês anterior pra conferir.`;
  }

  let acumulado = saldoInicial;
  const linhas: LinhaFechamento[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const porCategoria = indicesFinais.map((i) => soma[dia][i]);
    // Soma no saldo acumulado com base em TODAS as categorias (não só as
    // exibidas — esconder uma coluna zerada nunca deveria mudar o saldo) e
    // também do que ainda está sem categoria: o saldo só bate com o do banco
    // se entrar todo o movimento.
    acumulado += soma[dia].reduce((s, v) => s + v, 0) + semCategoriaPorDia[dia];
    linhas.push({ dia, porCategoria, semCategoria: semCategoriaPorDia[dia], saldoAcumulado: acumulado });
  }

  // Conferência: saldo que o banco informou dentro do mês x saldo calculado até o mesmo dia.
  let saldoBanco: ResultadoFechamento["saldoBanco"] = null;
  // O mais recente do mês; na mesma data, o que você conferiu e guardou ganha do saldo que veio no arquivo
  // (alguns bancos, como o Stone, mandam no arquivo um saldo diferente do extrato — ex: sem o valor bloqueado).
  const doMes = saldosBanco
    .filter((s) => s.data >= inicio && s.data <= fim)
    .sort((a, b) => a.data.getTime() - b.data.getTime() || Number(a.arquivoOrigem === "MANUAL") - Number(b.arquivoOrigem === "MANUAL"))
    .pop();
  if (doMes) {
    const calculado = linhas[doMes.data.getUTCDate() - 1].saldoAcumulado;
    saldoBanco = {
      data: doMes.data,
      valor: Number(doMes.saldo),
      calculado,
      diferenca: Math.round((Number(doMes.saldo) - calculado) * 100) / 100,
      conferidoPorVoce: doMes.arquivoOrigem === "MANUAL",
    };
  }

  const totalPorCategoria = indicesFinais.map((i) => totalPorCategoriaTodas[i]);
  const totalGeral = totalPorCategoria.reduce((s, v) => s + v, 0);

  const detalhes = await gerarDetalhes({ postoId, bancoId, inicio, fim, categorias: categoriasTodas });

  return {
    postoNome: posto.nome,
    bancoNome: banco.nome,
    ano,
    mes,
    ultimoDia,
    categorias,
    linhas,
    totalPorCategoria,
    totalGeral,
    saldoInicial,
    saldoInicialOrigem,
    saldoInicialObs,
    saldoFinal: acumulado,
    saldoBanco,
    totalSemCategoria,
    semCategoria: semCategoriaLinhas.length,
    detalhes,
  };
}

async function gerarDetalhes(params: {
  postoId: string;
  bancoId: string;
  inicio: Date;
  fim: Date;
  categorias: { id: string; nome: string }[];
}): Promise<{ categoriaNome: string; linhas: LinhaDetalhe[] }[]> {
  const { postoId, bancoId, inicio, fim, categorias } = params;
  const categoriasAlvo = categorias.filter((c) => DETALHE_NOME.includes(c.nome));
  if (categoriasAlvo.length === 0) return [];
  const idsAlvo = categoriasAlvo.map((c) => c.id);

  const [diretos, divisoes] = await Promise.all([
    // `divisoes: { none: {} }` pelo mesmo motivo de gerarFechamento acima —
    // sem isso, um lançamento dividido com categoriaId também preenchido no
    // registro principal aparece duas vezes no detalhamento.
    prisma.lancamentoExtrato.findMany({
      where: { postoId, bancoId, data: { gte: inicio, lte: fim }, categoriaId: { in: idsAlvo }, divisoes: { none: {} } },
      select: { data: true, valor: true, observacao: true, descricao: true, categoriaId: true },
    }),
    // Parte de um lançamento dividido (ver LancamentoExtratoDivisao) — ainda
    // não tem campo de observação editável na tela de divisão, então usa a
    // observação/descrição do lançamento "pai" como contexto.
    prisma.lancamentoExtratoDivisao.findMany({
      where: {
        categoriaId: { in: idsAlvo },
        lancamentoExtrato: { postoId, bancoId, data: { gte: inicio, lte: fim } },
      },
      select: {
        valor: true,
        categoriaId: true,
        observacao: true,
        lancamentoExtrato: { select: { data: true, observacao: true, descricao: true } },
      },
    }),
  ]);

  const porCategoria = new Map<string, LinhaDetalhe[]>(categoriasAlvo.map((c) => [c.id, []]));
  for (const l of diretos) {
    porCategoria.get(l.categoriaId as string)?.push({
      dia: l.data.getUTCDate(),
      data: l.data,
      valor: Number(l.valor),
      observacao: l.observacao ?? "",
      descricaoBanco: l.descricao,
    });
  }
  for (const d of divisoes) {
    if (!d.categoriaId) continue;
    porCategoria.get(d.categoriaId)?.push({
      dia: d.lancamentoExtrato.data.getUTCDate(),
      data: d.lancamentoExtrato.data,
      valor: Number(d.valor),
      observacao: d.observacao ?? d.lancamentoExtrato.observacao ?? "",
      descricaoBanco: d.lancamentoExtrato.descricao,
    });
  }

  return categoriasAlvo.map((c) => ({
    categoriaNome: c.nome,
    linhas: (porCategoria.get(c.id) ?? []).sort((a, b) => a.data.getTime() - b.data.getTime()),
  }));
}
