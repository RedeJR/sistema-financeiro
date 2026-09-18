"use client";

// Mesmo padrão de cartoes/fechamento/botao-imprimir.tsx — só imprime quando
// a usuária pede, sem disparar sozinho.
export function BotaoImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 print:hidden"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
