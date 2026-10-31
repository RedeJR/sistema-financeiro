// Busca de cadastros por texto (nome, código...) e por documento (CNPJ/CPF). Ignora acento, maiúscula e pontuação:
// "12.345.678/0001-90", "12345678000190" e "678/0001" encontram o mesmo cadastro, e o nome casa por partes, em
// qualquer ordem ("posto cantareira" encontra "CANTAREIRA POSTO DE SERVICOS LTDA").

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function casaBusca(termo: string, textos: (string | null | undefined)[], documentos: (string | null | undefined)[] = []): boolean {
  const t = termo.trim();
  if (!t) return true;
  const partes = semAcento(t).split(/\s+/).filter(Boolean);
  const alvo = semAcento(textos.filter(Boolean).join(" "));
  if (partes.every((p) => alvo.includes(p))) return true;
  const digitos = soDigitos(t);
  // documento: precisa de ao menos 3 dígitos pra não casar tudo; compara só os dígitos (com ou sem pontuação)
  if (digitos.length >= 3 && documentos.some((d) => d && soDigitos(d).includes(digitos))) return true;
  return documentos.some((d) => d && semAcento(d).includes(semAcento(t)));
}
