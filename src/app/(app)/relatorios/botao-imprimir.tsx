"use client";

// Igual ao de despesas-pagas/relatorio (removido — esse relatório
// substitui aquele) — só imprime quando a usuária pede, sem disparar
// sozinho: aqui a tela também serve pra só olhar filtrada, não só pra
// imprimir.
export function BotaoImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 print:hidden"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
