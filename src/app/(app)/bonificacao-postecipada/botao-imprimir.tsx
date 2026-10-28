"use client";

// Mesmo padrão dos outros botões de imprimir: só imprime quando a usuária pede. No diálogo do
// navegador dá pra escolher "Salvar como PDF".
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-black/15 bg-white px-3.5 py-2 text-sm font-medium hover:bg-black/5 print:hidden dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10"
    >
      Salvar / Imprimir (PDF)
    </button>
  );
}
