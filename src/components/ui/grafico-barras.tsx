import { formatarMoeda } from "@/lib/dinheiro";

// Gráfico de barras simples em SVG puro — sem biblioteca externa, pra não
// adicionar dependência só por causa de um gráfico. Responsivo (viewBox +
// width 100%), acompanha o tema claro/escuro via classes do Tailwind
// (fill-current + text-foreground/indigo), e o <title> de cada barra dá
// tooltip nativo do navegador ao passar o mouse, sem precisar de JS.
export function GraficoBarras({
  dados,
}: {
  dados: { label: string; valor: number }[];
}) {
  const largura = 640;
  const altura = 260;
  const margemBaixo = 36;
  const margemTopo = 28;
  const areaAltura = altura - margemBaixo - margemTopo;
  const max = Math.max(...dados.map((d) => d.valor), 1);

  const gap = 16;
  const larguraBarra = Math.min(72, (largura - gap * (dados.length + 1)) / dados.length);
  const larguraUsada = larguraBarra * dados.length + gap * (dados.length + 1);
  const offsetX = (largura - larguraUsada) / 2;

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="h-auto w-full"
      role="img"
      aria-label="Total de contas a pagar por posto"
    >
      {/* Linha de base */}
      <line
        x1={0}
        y1={altura - margemBaixo}
        x2={largura}
        y2={altura - margemBaixo}
        className="stroke-current text-black/10 dark:text-white/15"
        strokeWidth={1}
      />
      {dados.map((d, i) => {
        const h = max > 0 ? (d.valor / max) * areaAltura : 0;
        const x = offsetX + gap + i * (larguraBarra + gap);
        const y = margemTopo + (areaAltura - h);
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${formatarMoeda(d.valor)}`}</title>
            <rect
              x={x}
              y={y}
              width={larguraBarra}
              height={Math.max(h, 2)}
              rx={6}
              className="fill-current text-indigo-600 transition-opacity hover:opacity-80 dark:text-indigo-400"
            />
            <text
              x={x + larguraBarra / 2}
              y={y - 8}
              textAnchor="middle"
              fontSize="11"
              className="fill-current text-foreground/80"
            >
              {formatarMoeda(d.valor)}
            </text>
            <text
              x={x + larguraBarra / 2}
              y={altura - margemBaixo + 16}
              textAnchor="middle"
              fontSize="11"
              className="fill-current text-foreground/60"
            >
              {d.label.length > 12 ? `${d.label.slice(0, 11)}…` : d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
