"use client";

import { useEffect } from "react";

// Dispara a caixa de impressão do navegador sozinho ao abrir a página — a
// usuária só escolhe "Salvar como PDF" no destino. O botão fica como
// alternativa caso o navegador bloqueie a chamada automática.
export function BotaoImprimir() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 print:hidden"
    >
      Imprimir / Salvar como PDF
    </button>
  );
}
