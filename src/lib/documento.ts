// Formatação automática de CNPJ/CPF — usada tanto no onChange dos campos
// (formatação em tempo real, enquanto a usuária digita) quanto no servidor,
// antes de salvar (garante o mesmo formato mesmo se o JS não rodar, e deixa
// a coluna @unique no banco — ver schema.prisma — realmente pegar
// duplicidade, já que duas strings iguais em conteúdo mas formatadas
// diferente nunca vão bater numa constraint de igualdade).
//
// Só considera os dígitos digitados: até 11 vira CPF (000.000.000-00), da
// 12ª casa em diante vira CNPJ (00.000.000/0000-00) — mesmo padrão que já
// aparecia nos cadastros existentes antes dessa mudança.
export function formatarDocumento(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  if (!digitos) return "";
  if (digitos.length <= 11) {
    return digitos
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return digitos
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}
