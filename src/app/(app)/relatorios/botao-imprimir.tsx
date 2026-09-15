"use client";

// Igual ao de despesas-pagas/relatorio (removido — esse relatório
// substitui aquele) — só imprime quando a usuária pede, sem disparar
// sozinho: aqui a tela também serve pra só olhar filtrada, não só pra
// imprimir.
export function BotaoImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 print:hidden"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
