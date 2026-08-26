import { formatarMoeda } from "@/lib/dinheiro";

// Gráfico de barras agrupadas (2 séries por categoria) — mesmo espírito do
// GraficoBarras (SVG puro, sem biblioteca externa, tooltip nativo via
// <title>), mas comparando Despesas Pagas x Extrato conciliado lado a lado
// por posto ou por dia (ver dashboard da home). Cores fixas (azul/laranja)
// validadas pra leitura em daltonismo e contraste claro/escuro — ver
// skill de dataviz, references/palette.md.
export function GraficoComparativo({
  dados,
  serie1Label = "Despesas Pagas",
  serie2Label = "Extrato conciliado",
}: {
  dados: { label: string; serie1: number; serie2: number }[];
  serie1Label?: string;
  serie2Label?: string;
}) {
  const largura = 720;
  const altura = 280;
  const margemBaixo = 40;
  const margemTopo = 30;
  const areaAltura = altura - margemBaixo - margemTopo;
  const max = Math.max(...dados.flatMap((d) => [d.serie1, d.serie2]), 1);

  const gapGrupo = 20;
  const gapBarra = 3;
  const larguraGrupo = Math.min(90, (largura - gapGrupo * (dados.length + 1)) / dados.length);
  const larguraBarra = (larguraGrupo - gapBarra) / 2;
  const larguraUsada = larguraGrupo * dados.length + gapGrupo * (dados.length + 1);
  const offsetX = (largura - larguraUsada) / 2;

  // Só rotula o valor em cima da barra quando cabem poucos grupos — com
  // muita categoria (ex: 30 dias) o número em cima de cada barrinha vira
  // ruído ilegível; o <title> (tooltip nativo) cobre esse caso.
  const mostrarRotuloValor = dados.length <= 8;

  return (
    <div className="viz-comparativo space-y-2">
      <style>{`
        .viz-comparativo {
          --serie1: #2a78d6;
          --serie2: #eb6834;
        }
        @media (prefers-color-scheme: dark) {
          .viz-comparativo {
            --serie1: #3987e5;
            --serie2: #d95926;
          }
        }
      `}</style>

      {/* Legenda — sempre visível com 2+ séries, texto em tinta neutra (a
          cor só aparece na bolinha, nunca no texto). */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--serie1)" }} />
          {serie1Label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--serie2)" }} />
          {serie2Label}
        </span>
      </div>

      <svg viewBox={`0 0 ${largura} ${altura}`} className="h-auto w-full" role="img" aria-label={`${serie1Label} comparado com ${serie2Label}`}>
        <line
          x1={0}
          y1={altura - margemBaixo}
          x2={largura}
          y2={altura - margemBaixo}
          className="stroke-current text-black/10 dark:text-white/15"
          strokeWidth={1}
        />
        {dados.map((d, i) => {
          const xGrupo = offsetX + gapGrupo + i * (larguraGrupo + gapGrupo);
          const h1 = max > 0 ? (d.serie1 / max) * areaAltura : 0;
          const h2 = max > 0 ? (d.serie2 / max) * areaAltura : 0;
          const y1 = margemTopo + (areaAltura - h1);
          const y2 = margemTopo + (areaAltura - h2);
          return (
            <g key={d.label}>
              <title>{`${d.label} — ${serie1Label}: ${formatarMoeda(d.serie1)} · ${serie2Label}: ${formatarMoeda(d.serie2)}`}</title>
              <rect
                x={xGrupo}
                y={y1}
                width={larguraBarra}
                height={Math.max(h1, 2)}
                rx={3}
                fill="var(--serie1)"
                className="transition-opacity hover:opacity-80"
              />
              <rect
                x={xGrupo + larguraBarra + gapBarra}
                y={y2}
                width={larguraBarra}
                height={Math.max(h2, 2)}
                rx={3}
                fill="var(--serie2)"
                className="transition-opacity hover:opacity-80"
              />
              {mostrarRotuloValor && (
                <>
                  <text
                    x={xGrupo + larguraBarra / 2}
                    y={y1 - 6}
                    textAnchor="middle"
                    fontSize="9.5"
                    className="fill-current text-foreground/70"
                  >
                    {formatarMoeda(d.serie1)}
                  </text>
                  <text
                    x={xGrupo + larguraBarra + gapBarra + larguraBarra / 2}
                    y={y2 - 6}
                    textAnchor="middle"
                    fontSize="9.5"
                    className="fill-current text-foreground/70"
                  >
                    {formatarMoeda(d.serie2)}
                  </text>
                </>
              )}
              <text
                x={xGrupo + larguraGrupo / 2 - gapBarra / 2}
                y={altura - margemBaixo + 16}
                textAnchor="middle"
                fontSize="11"
                className="fill-current text-foreground/60"
              >
                {d.label.length > 13 ? `${d.label.slice(0, 12)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
