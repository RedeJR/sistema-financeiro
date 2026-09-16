// Resolução de posto pra arquivos multi-posto (hoje só a Stone) — um único
// arquivo trás transações de vários postos juntas, identificadas pelo CNPJ.
// Prefixos herdados do protótipo em Python que já lê esses arquivos há
// tempos — se a Stone cadastrar um posto novo, precisa adicionar aqui.
const CNPJ_STONE_POSTO: Record<string, string> = {
  "09289": "Jd Torino",
  "53060": "Oliveira",
  "48741": "Paineira",
  "15584": "Lisboa",
  "60761": "Sul America",
  "10961": "Sinergia",
  "62878": "Cantareira",
  "63107": "Goodbye",
  "66058": "Aveiro",
};

export function postoPorCnpjStone(cnpj: unknown): string | null {
  if (!cnpj) return null;
  const bruto = String(cnpj).trim();
  // Alguns exports da Stone passam pelo Excel antes de virar CSV, que troca
  // o CNPJ (14 dígitos) por notação científica com vírgula decimal — ex:
  // "6,28783E+13" em vez de "62878254000164". Isso perde precisão nos
  // últimos dígitos, mas não nos primeiros 5 (o prefixo que a gente usa pra
  // identificar o posto), então ainda dá pra casar certo.
  const normalizado = bruto.toUpperCase().includes("E+") ? bruto.replace(",", ".") : bruto;
  const n = Number(normalizado);
  const limpo = Number.isFinite(n)
    ? String(Math.trunc(n)).padStart(14, "0")
    : bruto.replace(/\D/g, "").padStart(14, "0");
  for (const [prefixo, nome] of Object.entries(CNPJ_STONE_POSTO)) {
    if (limpo.startsWith(prefixo)) return nome;
  }
  return null;
}

const DIACRITICOS = /[̀-ͯ]/g;

function normalizarNome(s: string): string {
  return s.trim().toUpperCase().normalize("NFD").replace(DIACRITICOS, "");
}

export function encontrarPostoPorNome<T extends { nome: string }>(postos: T[], nomeAlvo: string): T | null {
  const alvo = normalizarNome(nomeAlvo);
  return postos.find((p) => normalizarNome(p.nome) === alvo) ?? null;
}
