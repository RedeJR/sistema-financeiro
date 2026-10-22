// Põe a impressão desta tela em A4 paisagem. Tem que valer pro documento inteiro (um @page sem nome):
// com página nomeada por elemento, o Chrome calculava a largura pela 1ª página (retrato) e deixava
// uma página em branco antes do relatório.
export function OrientacaoImpressao() {
  return <style>{"@media print { @page { size: A4 landscape; } }"}</style>;
}
