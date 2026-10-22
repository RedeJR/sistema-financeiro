"use client";

// Mesmo padrão de relatorios/botao-imprimir.tsx — só imprime quando a
// usuária pede, sem disparar sozinho.
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
