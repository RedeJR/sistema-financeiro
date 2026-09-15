import { formatarMoeda } from "@/lib/dinheiro";

type LinhaGrafico = { label: string; despesas: number; combustiveis: number };

// Gráfico de barras horizontais em SVG puro — sem biblioteca externa, pra
// não adicionar dependência só por causa de um gráfico. Cada posto é uma
// linha (em vez de coluna vertical): com muitos postos as colunas ficavam
// espremidas e os rótulos se sobrepunham; na horizontal cabe quantos postos
// precisar, só crescendo a altura (a página rola, não o gráfico). Duas
// barras por linha — despesas em azul, combustíveis em laranja — na mesma
// escala, pra dar pra comparar as duas de cara.
export function GraficoBarras({ dados }: { dados: LinhaGrafico[] }) {
  const largura = 640;
  const rotuloLargura = 136;
  const paddingDireita = 76;
  const areaLargura = largura - rotuloLargura - paddingDireita;

  const alturaBarra = 11;
  const espacoEntreBarras = 3;
  const alturaLinha = alturaBarra * 2 + espacoEntreBarras + 14;
  const margemTopo = 28;
  const margemBaixo = 8;
  const altura = margemTopo + dados.length * alturaLinha + margemBaixo;

  const max = Math.max(...dados.flatMap((d) => [d.despesas, d.combustiveis]), 1);
  const escala = (v: number) => (v / max) * areaLargura;

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="h-auto w-full"
      role="img"
      aria-label="Total de despesas e combustíveis por posto"
    >
      <g>
        <rect
          x={rotuloLargura}
          y={4}
          width={10}
          height={10}
          rx={2}
          className="fill-current text-blue-600 dark:text-blue-400"
        />
        <text x={rotuloLargura + 14} y={13} fontSize="11" className="fill-current text-foreground/70">
          Despesas
        </text>
        <rect
          x={rotuloLargura + 78}
          y={4}
          width={10}
          height={10}
          rx={2}
          className="fill-current text-orange-500 dark:text-orange-400"
        />
        <text x={rotuloLargura + 92} y={13} fontSize="11" className="fill-current text-foreground/70">
          Combustíveis
        </text>
      </g>

      {dados.map((d, i) => {
        const y0 = margemTopo + i * alturaLinha;
        const larguraDespesas = escala(d.despesas);
        const larguraCombustiveis = escala(d.combustiveis);
        const yDespesas = y0;
        const yCombustiveis = y0 + alturaBarra + espacoEntreBarras;
        const yLabel = y0 + alturaBarra + espacoEntreBarras / 2;

        return (
          <g key={d.label}>
            <title>{`${d.label} — Despesas: ${formatarMoeda(d.despesas)}, Combustíveis: ${formatarMoeda(d.combustiveis)}`}</title>
            <text
              x={rotuloLargura - 8}
              y={yLabel + 4}
              textAnchor="end"
              fontSize="11"
              className="fill-current text-foreground/70"
            >
              {d.label.length > 16 ? `${d.label.slice(0, 15)}…` : d.label}
            </text>

            <rect
              x={rotuloLargura}
              y={yDespesas}
              width={d.despesas > 0 ? Math.max(larguraDespesas, 2) : 0}
              height={alturaBarra}
              rx={3}
              className="fill-current text-blue-600 transition-opacity hover:opacity-80 dark:text-blue-400"
            />
            {d.despesas > 0 && (
              <text
                x={rotuloLargura + larguraDespesas + 4}
                y={yDespesas + alturaBarra - 2}
                fontSize="10"
                className="fill-current text-foreground/60"
              >
                {formatarMoeda(d.despesas)}
              </text>
            )}

            <rect
              x={rotuloLargura}
              y={yCombustiveis}
              width={d.combustiveis > 0 ? Math.max(larguraCombustiveis, 2) : 0}
              height={alturaBarra}
              rx={3}
              className="fill-current text-orange-500 transition-opacity hover:opacity-80 dark:text-orange-400"
            />
            {d.combustiveis > 0 && (
              <text
                x={rotuloLargura + larguraCombustiveis + 4}
                y={yCombustiveis + alturaBarra - 2}
                fontSize="10"
                className="fill-current text-foreground/60"
              >
                {formatarMoeda(d.combustiveis)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
