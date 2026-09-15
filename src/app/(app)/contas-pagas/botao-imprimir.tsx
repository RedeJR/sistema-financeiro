"use client";

// Mesmo padrão de relatorios/botao-imprimir.tsx — só imprime quando a
// usuária pede, sem disparar sozinho.
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
