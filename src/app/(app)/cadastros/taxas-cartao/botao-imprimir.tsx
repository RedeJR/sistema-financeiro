"use client";

// Duas impressões das taxas: Analítico (tudo que está na tela: taxas com prazo, % das vendas,
// domicílio, grupo, observação e status) e Sintético (só adquirente e taxas). A diferença é só de
// CSS: o botão marca <html data-relatorio="..."> enquanto o diálogo de impressão está aberto, e as
// regras @media print da página escondem as colunas extras (ver page.tsx). O sintético, com poucas
// colunas, sai em retrato; o analítico segue em paisagem.
type Tipo = "analitico" | "sintetico";

const TITULO: Record<Tipo, string> = {
  analitico: "Taxas de Cartão - Relatório Analítico",
  sintetico: "Taxas de Cartão - Relatório Sintético",
};

function imprimir(tipo: Tipo) {
  const raiz = document.documentElement;
  const tituloAnterior = document.title;
  const orientacao = document.createElement("style");
  orientacao.textContent = `@page { size: A4 ${tipo === "sintetico" ? "portrait" : "landscape"}; }`;
  document.head.appendChild(orientacao);
  raiz.dataset.relatorio = tipo;
  document.title = TITULO[tipo]; // o Chrome sugere esse nome ao salvar o PDF

  const restaurar = () => {
    delete raiz.dataset.relatorio;
    document.title = tituloAnterior;
    orientacao.remove();
    window.removeEventListener("afterprint", restaurar);
  };
  window.addEventListener("afterprint", restaurar);
  window.print();
}

const botao =
  "rounded-md border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5 print:hidden dark:border-white/20 dark:hover:bg-white/10";

export function BotaoImprimir() {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button type="button" onClick={() => imprimir("analitico")} className={botao} title="Completo: taxas com prazo, % das vendas, domicílio, grupo, observação e status">
        Relatório Analítico (PDF)
      </button>
      <button type="button" onClick={() => imprimir("sintetico")} className={botao} title="Só adquirente e taxas, sem as outras informações">
        Relatório Sintético (PDF)
      </button>
    </div>
  );
}
