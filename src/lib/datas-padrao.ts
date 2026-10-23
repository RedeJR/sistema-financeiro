// Filtro de datas padrão das listas longas (pra não carregar o histórico inteiro a cada abertura):
//  - o que JÁ PASSOU (despesas/contas/combustíveis pagos, vendas) abre no DIA ANTERIOR;
//  - o que AINDA VAI VENCER (contas e combustíveis a pagar, conferência diária) abre no DIA ATUAL.
// Só vale quando a URL não traz nenhuma das duas datas. Quem esvazia as datas e filtra (as datas
// chegam como texto vazio, "de=&ate=") vê tudo, sem limite de data.

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

export type PadraoDatas = { de: string | undefined; ate: string | undefined; padrao: boolean };

export function padraoDeDatas(de: string | undefined, ate: string | undefined, modo: "hoje" | "ontem"): PadraoDatas {
  if (de === undefined && ate === undefined) {
    const dia = modo === "hoje" ? hojeISOBrasil() : ontemISOBrasil();
    return { de: dia, ate: dia, padrao: true };
  }
  return { de, ate, padrao: false };
}
