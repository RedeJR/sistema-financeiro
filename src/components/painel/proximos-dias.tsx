import { formatarMoeda } from "@/lib/dinheiro";

type Dia = { dia: string; pagar: number | null; receber: number | null };

const ALTURA = 170;

function rotulo(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const sem = d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short" }).replace(".", "");
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit" });
  return `${sem.charAt(0).toUpperCase()}${sem.slice(1)} ${dia}`;
}

// Barras lado a lado por dia útil: a pagar (azul) x a receber previsto (verde),
// na mesma escala. HTML/CSS puro — sem biblioteca de gráfico.
export function ProximosDias({ dias }: { dias: Dia[] }) {
  const max = Math.max(1, ...dias.flatMap((d) => [d.pagar ?? 0, d.receber ?? 0]));
  const altura = (v: number | null) => (v === null ? 0 : Math.max(v > 0 ? 3 : 0, Math.round((v / max) * ALTURA)));
  const temPagar = dias.some((d) => d.pagar !== null);
  const temReceber = dias.some((d) => d.receber !== null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 text-[12.5px] text-foreground/60">
        {temPagar && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-blue-700" /> A pagar
          </span>
        )}
        {temReceber && (
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-600" /> A receber (previsto)
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 border-b border-black/10 px-1 dark:border-white/15" style={{ height: ALTURA + 40 }}>
        {dias.map((d) => (
          <div
            key={d.dia}
            className="flex flex-1 flex-col items-center gap-1.5"
            title={`${rotulo(d.dia)}${d.pagar !== null ? ` — a pagar ${formatarMoeda(d.pagar)}` : ""}${d.receber !== null ? ` — a receber ${formatarMoeda(d.receber)}` : ""}`}
          >
            <div className="flex items-end gap-1" style={{ height: ALTURA }}>
              {d.pagar !== null && <div className="w-5 rounded-t bg-blue-700 sm:w-6" style={{ height: altura(d.pagar) }} />}
              {d.receber !== null && <div className="w-5 rounded-t bg-emerald-600 sm:w-6" style={{ height: altura(d.receber) }} />}
            </div>
            <span className="pb-1 text-xs font-semibold">{rotulo(d.dia)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
