// Banco padrão de cada posto (regra da usuária, 08/10/2026): Sinergia = Stone,
// Lago = Itaú, Aveiro = Banco do Brasil, todos os demais = Bradesco. Serve
// pra já preencher o banco ao lançar uma conta / despesa — ela troca na hora
// se for diferente. (Antes a sugestão era pelo fornecedor, o que estava errado:
// o banco depende de qual posto paga, não de quem recebe.)
const BANCO_POR_POSTO: Record<string, string> = {
  SINERGIA: "STONE",
  LAGO: "ITAÚ",
  AVEIRO: "BANCO DO BRASIL",
};
const BANCO_PADRAO = "BRADESCO";

function normalizar(s: string): string {
  return s.trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function nomeBancoPadraoDoPosto(postoNome: string): string {
  return BANCO_POR_POSTO[normalizar(postoNome)] ?? BANCO_PADRAO;
}

// postoId -> bancoId (só inclui o posto se o banco existir cadastrado).
export function bancoPadraoPorPosto(
  postos: { id: string; nome: string }[],
  bancos: { id: string; nome: string }[]
): Record<string, string> {
  const idPorNome = new Map(bancos.map((b) => [normalizar(b.nome), b.id]));
  const resultado: Record<string, string> = {};
  for (const p of postos) {
    const bancoId = idPorNome.get(normalizar(nomeBancoPadraoDoPosto(p.nome)));
    if (bancoId) resultado[p.id] = bancoId;
  }
  return resultado;
}
