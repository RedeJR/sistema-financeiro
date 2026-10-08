import * as XLSX from "xlsx";

// Leitura e "casamento de nomes" da planilha de despesas (Despesas Pagas >
// Importar planilha). Funções puras — sem banco — pra dar pra testar fora do
// Next. A parte que fala com o banco fica em
// src/app/(app)/despesas-pagas/importar/actions.ts.

export type LinhaPlanilha = {
  linha: number; // número da linha na planilha (cabeçalho = 1)
  posto: string; // POSTO PAGADOR, como escrito
  data: string | null; // YYYY-MM-DD
  valor: number | null;
  fornecedor: string;
  descricao: string;
  plano: string;
  erros: string[]; // problemas do próprio arquivo (data/valor inválidos...)
};

export function normalizarTexto(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

const CABECALHOS: Record<string, keyof Omit<LinhaPlanilha, "linha" | "erros">> = {
  "POSTO PAGADOR": "posto",
  POSTO: "posto",
  DATA: "data",
  VALOR: "valor",
  FORNECEDOR: "fornecedor",
  DESCRICAO: "descricao",
  "PLANO DE CONTAS": "plano",
  PLANO: "plano",
};

function paraDataISO(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Excel guarda a data como "meia-noite local" e o SheetJS devolve com um
    // desvio de horas/segundos (ex: 03:00:28Z) — arredonda pro dia mais
    // próximo em vez de truncar, pra não escorregar um dia.
    const dia = new Date(Math.round(v.getTime() / 86400000) * 86400000);
    return dia.toISOString().slice(0, 10);
  }
  const t = String(v ?? "").trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

function paraNumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

export function lerPlanilhaDespesas(buffer: Buffer): LinhaPlanilha[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia.");
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });

  const idxCabecalho = linhas.findIndex((l) => l.some((c) => normalizarTexto(c) === "VALOR") && l.some((c) => normalizarTexto(c) === "DATA"));
  if (idxCabecalho === -1) {
    throw new Error('Não achei o cabeçalho. A primeira linha precisa ter as colunas: POSTO PAGADOR, DATA, VALOR, FORNECEDOR, DESCRIÇÃO e PLANO DE CONTAS.');
  }
  const coluna: Partial<Record<keyof Omit<LinhaPlanilha, "linha" | "erros">, number>> = {};
  linhas[idxCabecalho].forEach((c, i) => {
    const campo = CABECALHOS[normalizarTexto(c)];
    if (campo && coluna[campo] === undefined) coluna[campo] = i;
  });
  const faltando = (["posto", "data", "valor", "fornecedor", "plano"] as const).filter((c) => coluna[c] === undefined);
  if (faltando.length > 0) {
    throw new Error(`Faltam colunas na planilha: ${faltando.map((c) => ({ posto: "POSTO PAGADOR", data: "DATA", valor: "VALOR", fornecedor: "FORNECEDOR", plano: "PLANO DE CONTAS" })[c]).join(", ")}.`);
  }

  const resultado: LinhaPlanilha[] = [];
  linhas.slice(idxCabecalho + 1).forEach((l, i) => {
    const pega = (c: keyof typeof coluna) => (coluna[c] === undefined ? null : l[coluna[c]!]);
    if (l.every((c) => c === null || String(c).trim() === "")) return; // linha em branco
    const erros: string[] = [];
    const data = paraDataISO(pega("data"));
    const valor = paraNumero(pega("valor"));
    if (!data) erros.push("Data inválida ou em branco.");
    if (valor === null || valor <= 0) erros.push("Valor inválido ou zerado.");
    resultado.push({
      linha: idxCabecalho + 2 + i,
      posto: String(pega("posto") ?? "").trim(),
      data,
      valor: valor !== null && valor > 0 ? valor : null,
      fornecedor: String(pega("fornecedor") ?? "").trim(),
      descricao: String(pega("descricao") ?? "").trim(),
      plano: String(pega("plano") ?? "").trim(),
      erros,
    });
  });
  return resultado;
}

// ---------------------------------------------------------------------------
// Casamento de nomes
// ---------------------------------------------------------------------------

export type Resolucao = { id: string | null; origem: "apelido" | "exato" | "sugerido" | null };

const PALAVRAS_SOLTAS = new Set(["POSTO", "LTDA", "EIRELI", "ME", "DE", "DO", "DA", "DOS", "DAS", "E", "S/A", "SA", "AUTO", "EPP"]);

function tokens(s: string): string[] {
  return normalizarTexto(s)
    .replace(/[.,\-/()*]/g, " ")
    .split(" ")
    .filter((t) => t && !PALAVRAS_SOLTAS.has(t));
}

// Cada palavra de `a` aparece (inteira ou como começo de palavra, a partir de 4
// letras) em alguma palavra de `b` — ex: "GOOD" em "GOODBYE", "SUL" em "SUL
// AMERICA", "LAGO FRIAS" não está em "LAGO" (mas o contrário sim).
function todasPalavrasEm(a: string[], b: string[]): boolean {
  return a.length > 0 && a.every((ta) => b.some((tb) => tb === ta || (ta.length >= 4 && tb.startsWith(ta))));
}

// 1) apelido salvo, 2) nome igual (ignorando acento/maiúscula), 3) uma única
// opção "parecida" — só aí vira "sugerido" (a tela marca pra confirmar). Mais de
// uma opção parecida = ambíguo, não sugere nada (ela escolhe e o sistema lembra).
// `inverso`: também aceita o cadastro ser um pedaço do texto (ex: posto "LAGO" em
// "LAGO FRIAS") — só vale pra posto; em plano de contas e fornecedor gera sugestão
// errada (ex: plano "DESPESA POSTO" casando com "OUTRAS DESPESAS OPE.").
export function resolverNome(
  texto: string,
  itens: { id: string; nome: string }[],
  apelidos: Map<string, string>,
  opcoes: { inverso?: boolean } = {}
): Resolucao {
  const chave = normalizarTexto(texto);
  if (!chave) return { id: null, origem: null };
  const apelido = apelidos.get(chave);
  if (apelido && itens.some((i) => i.id === apelido)) return { id: apelido, origem: "apelido" };
  const exato = itens.filter((i) => normalizarTexto(i.nome) === chave);
  if (exato.length === 1) return { id: exato[0].id, origem: "exato" };
  const t = tokens(texto);
  const parecidos = itens.filter((i) => {
    const ti = tokens(i.nome);
    return todasPalavrasEm(t, ti) || (opcoes.inverso === true && todasPalavrasEm(ti, t));
  });
  if (parecidos.length === 1) return { id: parecidos[0].id, origem: "sugerido" };
  return { id: null, origem: null };
}

// ---------------------------------------------------------------------------
// Tipos da tela de conferência (compartilhados entre actions e o componente)
// ---------------------------------------------------------------------------

export type LinhaPreview = {
  linha: number;
  data: string | null;
  valor: number | null;
  descricao: string;
  postoTexto: string;
  fornecedorTexto: string;
  planoTexto: string;
  postoPagadorId: string | null;
  postoPagadorOrigem: Resolucao["origem"];
  postoDonoId: string | null;
  fornecedorId: string | null;
  fornecedorOrigem: Resolucao["origem"];
  planoContaId: string | null;
  planoOrigem: Resolucao["origem"];
  erros: string[];
  // "sistema" = já existe despesa paga do mesmo posto pagador, data e valor;
  // "arquivo" = linha igual a outra do próprio arquivo. Pode ser real ou erro —
  // quem decide é a usuária (a linha vem desmarcada).
  duplicada: { onde: "sistema" | "arquivo"; detalhe: string } | null;
};

export type LinhaParaImportar = {
  linha: number;
  data: string;
  valor: number;
  descricao: string;
  postoTexto: string;
  fornecedorTexto: string;
  planoTexto: string;
  postoPagadorId: string;
  postoDonoId: string;
  fornecedorId: string;
  planoContaId: string;
};
