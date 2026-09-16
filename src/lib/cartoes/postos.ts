// Resolução de posto pra arquivos multi-posto (Stone, SAQPAY, Sem Parar,
// Abastece Aí) — um único arquivo traz transações de vários postos juntas,
// identificadas por CNPJ ou por um nome livre (razão social/apelido).

const DIACRITICOS = /[̀-ͯ]/g;

function normalizarNome(s: string): string {
  return s.trim().toUpperCase().normalize("NFD").replace(DIACRITICOS, "");
}

// Extrai os dígitos de um CNPJ, tolerando os três formatos observados na
// prática: string normal ("53.060.723/0001-42"), notação científica com
// ponto ("5.306072e+13") ou com vírgula — padrão Excel pt-BR quando a
// coluna vira número ("5,306072E+13"). A notação científica perde precisão
// nos últimos dígitos, mas não nos primeiros 5 (o prefixo usado abaixo pra
// achar o posto), então ainda dá pra casar certo.
export function paraCnpjDigitos(valor: unknown): string | null {
  if (!valor) return null;
  const bruto = String(valor).trim();
  const normalizado = bruto.toUpperCase().includes("E+") ? bruto.replace(",", ".") : bruto;
  const n = Number(normalizado);
  if (Number.isFinite(n) && normalizado !== bruto.replace(/\D/g, "")) {
    return String(Math.trunc(n)).padStart(14, "0");
  }
  const digitos = bruto.replace(/\D/g, "");
  return digitos ? digitos.padStart(14, "0") : null;
}

// Casa pelos 5 primeiros dígitos do CNPJ (raiz curta) em vez do CNPJ
// completo — necessário porque a notação científica só preserva essa
// precisão, e isso já basta pra distinguir os postos da rede entre si.
export function encontrarPostoPorCnpj<T extends { cnpj: string | null }>(
  postos: T[],
  cnpjBruto: unknown
): T | null {
  const digitos = paraCnpjDigitos(cnpjBruto);
  if (!digitos) return null;
  const prefixo = digitos.slice(0, 5);
  return postos.find((p) => p.cnpj && p.cnpj.replace(/\D/g, "").startsWith(prefixo)) ?? null;
}

// Algumas adquirentes cadastram o posto com um nome que não bate com nada
// do nome oficial (ex: SAQPAY chama o turno da manhã do Oliveira de
// "JR PDV GNV MANHA") — apelidos conhecidos ficam aqui, verificados antes
// da tentativa de casar por substring.
const APELIDOS_POSTO: Record<string, string> = {
  "PDV GNV": "OLIVEIRA",
  "JR TORINO": "JD TORINO",
  // Sem Parar trunca a razão social nesse ponto (falta "-DHABI" no fim).
  "COMBUSTIVEIS ABU": "ABU-DHABI",
};

// Casa um texto livre (razão social, nome de loja) contra a lista de
// postos: primeiro tenta os apelidos conhecidos, depois verifica se o nome
// oficial de algum posto aparece como substring do texto (ex: "POSTO SUL
// AMERICA EIRELI" contém "SUL AMERICA").
export function encontrarPostoPorFragmento<T extends { nome: string }>(
  postos: T[],
  textoLivre: string
): T | null {
  const normalizado = normalizarNome(textoLivre);
  for (const [apelido, nomeOficial] of Object.entries(APELIDOS_POSTO)) {
    if (normalizado.includes(normalizarNome(apelido))) {
      return postos.find((p) => normalizarNome(p.nome) === normalizarNome(nomeOficial)) ?? null;
    }
  }
  // Entre vários postos cujo nome poderia bater por substring, fica com o
  // nome mais longo (mais específico) — evita que um posto de nome curto
  // (ex: "SUL AMERICA" vs "SUL AMERICA COMBUSTIVEIS") capture errado.
  const candidatos = postos.filter((p) => normalizado.includes(normalizarNome(p.nome)));
  candidatos.sort((a, b) => b.nome.length - a.nome.length);
  return candidatos[0] ?? null;
}
