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
  const limpo = String(cnpj).replace(/\D/g, "").padStart(14, "0");
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
