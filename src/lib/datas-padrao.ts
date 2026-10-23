// Filtro de datas padrão das listas longas (pra não carregar o histórico inteiro a cada abertura):
//  - o que JÁ PASSOU (despesas/contas/combustíveis pagos, vendas) abre no ÚLTIMO DIA ÚTIL (ontem, ou sexta na segunda);
//  - o que AINDA VAI VENCER (contas e combustíveis a pagar, conferência diária) abre no DIA ATUAL.
// Só vale quando a URL não traz nenhuma das duas datas. Quem esvazia as datas e filtra (as datas
// chegam como texto vazio, "de=&ate=") vê tudo, sem limite de data.

import { ehDiaUtil } from "@/lib/cartoes/normalizar";

function diaNoBrasil(deslocamento: number): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const d = new Date(`${base}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return d.toISOString().slice(0, 10);
}

export function hojeISOBrasil(): string {
  return diaNoBrasil(0);
}

export function ontemISOBrasil(): string {
  return diaNoBrasil(-1);
}

// Último dia útil ANTES de hoje (pula sábado, domingo e feriado nacional): numa segunda-feira é a sexta.
export function ultimoDiaUtilISOBrasil(): string {
  for (let n = 1; n <= 10; n++) {
    const iso = diaNoBrasil(-n);
    if (ehDiaUtil(new Date(`${iso}T00:00:00.000Z`))) return iso;
  }
  return diaNoBrasil(-1);
}

export type PadraoDatas = { de: string | undefined; ate: string | undefined; padrao: boolean };

export function padraoDeDatas(de: string | undefined, ate: string | undefined, modo: "hoje" | "ontem"): PadraoDatas {
  if (de === undefined && ate === undefined) {
    const dia = modo === "hoje" ? hojeISOBrasil() : ultimoDiaUtilISOBrasil();
    return { de: dia, ate: dia, padrao: true };
  }
  return { de, ate, padrao: false };
}
