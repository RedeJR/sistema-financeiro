// Utilidades de CPF: limpar formatação, formatar pra exibição, e validar os
// dígitos verificadores (evita cadastrar CPF digitado errado por engano).

export function limparCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export function formatarCpf(cpf: string): string {
  const digitos = limparCpf(cpf);
  if (digitos.length !== 11) return cpf;
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function cpfValido(cpf: string): boolean {
  const digitos = limparCpf(cpf);
  if (digitos.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitos)) return false; // todos os dígitos iguais

  const calcularDigito = (base: string, pesoInicial: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const d1 = calcularDigito(digitos.slice(0, 9), 10);
  const d2 = calcularDigito(digitos.slice(0, 10), 11);

  return d1 === Number(digitos[9]) && d2 === Number(digitos[10]);
}
