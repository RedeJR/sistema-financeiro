import { formatarMoeda } from "@/lib/dinheiro";
import type { LinhaStatusPosto, StatusCelulaDia } from "@/lib/conciliacao";

// Painel "bater o olho": uma linha por posto, uma faixa de dias — pedido da
// usuária foi literal: "ver de forma prática quais dias de extrato e
// despesas estão lançados" e achar rápido "o extrato do banco x está sem
// conciliar desde o dia y". Por isso é uma faixa de status (tipo gráfico de
// disponibilidade/uptime), não um gráfico de valor — a cor importa, o
// tamanho da barra não.
//
// Cores de STATUS (fixas, nunca usadas como cor de série categórica — ver
// skill de dataviz, references/palette.md "Status palette"), sempre com
// legenda por perto e tooltip por célula, nunca só a cor sozinha.
const COR_STATUS: Record<StatusCelulaDia, string> = {
  conciliado: "#0ca30c",
  divergente: "#d03b3b",
  "falta-extrato": "#fab219",
  "falta-despesa": "#ec835a",
  "sem-atividade": "transparent",
};

const ROTULO_STATUS: Record<StatusCelulaDia, string> = {
  conciliado: "Conciliado",
  divergente: "Divergente (tem os dois lados, mas não bate)",
  "falta-extrato": "Falta extrato (despesa lançada, extrato não chegou/categorizado)",
  "falta-despesa": "Falta despesa (extrato categorizado, ninguém lançou a despesa)",
  "sem-atividade": "Sem movimento nesse dia",
};

function formatarDataCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

function Legenda() {
  const itens: StatusCelulaDia[] = ["conciliado", "divergente", "falta-extrato", "falta-despesa"];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/70">
      {itens.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10 dark:border-white/20"
            style={{ background: COR_STATUS[s] }}
          />
          {s === "conciliado" && "Conciliado"}
          {s === "divergente" && "Divergente"}
          {s === "falta-extrato" && "Falta extrato"}
          {s === "falta-despesa" && "Falta despesa"}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm border border-black/15 dark:border-white/20" />
        Sem movimento
      </span>
    </div>
  );
}

function LinhaPosto({ linha }: { linha: LinhaStatusPosto }) {
  const hoje = new Date();
  const diasSemExtrato = linha.ultimoDiaComExtrato
    ? Math.round((hoje.getTime() - linha.ultimoDiaComExtrato.getTime()) / 86400000)
    : null;

  return (
    <div className="space-y-1 border-t border-black/5 py-2 first:border-t-0 dark:border-white/10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-foreground/85">{linha.postoNome}</span>
        <span className="text-xs text-foreground/50">
          {formatarMoeda(linha.totalDespesa)} despesas · {formatarMoeda(linha.totalExtrato)} extrato
          {linha.ultimoDiaComExtrato === null ? (
            <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-500">
              — nenhum extrato conciliado no período
            </span>
          ) : (
            diasSemExtrato !== null &&
            diasSemExtrato >= 3 && (
              <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-500">
                — sem extrato conciliado desde {formatarDataCurta(linha.ultimoDiaComExtrato)} ({diasSemExtrato}{" "}
                dias)
              </span>
            )
          )}
        </span>
      </div>
      <div className="flex gap-[2px]">
        {linha.celulas.map((c) => (
          <div
            key={c.data.toISOString()}
            title={`${formatarDataCurta(c.data)} — ${ROTULO_STATUS[c.status]}${
              c.status === "sem-atividade"
                ? ""
                : ` · despesas ${formatarMoeda(c.despesaTotal)} · extrato ${formatarMoeda(c.extratoTotal)}`
            }`}
            className="h-4 w-2.5 shrink-0 rounded-[2px] border border-black/10 dark:border-white/10"
            style={{ background: COR_STATUS[c.status] }}
          />
        ))}
      </div>
    </div>
  );
}

export function FaixaStatusDiario({ linhas }: { linhas: LinhaStatusPosto[] }) {
  return (
    <div className="space-y-3">
      <Legenda />
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {linhas.map((l) => (
            <LinhaPosto key={l.postoId} linha={l} />
          ))}
        </div>
      </div>
    </div>
  );
}
