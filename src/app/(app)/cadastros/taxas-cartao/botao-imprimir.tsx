"use client";

// Mesmo padrão dos outros botões de imprimir (ex: cartoes/conferencia-taxas) — só
// imprime quando a usuária pede.
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5 print:hidden dark:border-white/20 dark:hover:bg-white/10"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
