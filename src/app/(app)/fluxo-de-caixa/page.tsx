import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { buscarFluxoCaixa } from "./consulta";
import { salvarFluxoCaixa } from "./actions";
import { BotaoImprimir } from "./botao-imprimir";
import { TabelaFluxoCaixa } from "./tabela-fluxo-caixa";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function FluxoDeCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; de?: string; ate?: string }>;
}) {
  await exigirPermissao("FLUXO_DE_CAIXA", "visualizar");
  const podeEditar = await podeEditarModulo("FLUXO_DE_CAIXA");

  const filtros = await searchParams;
  const postoIds = paraArray(filtros.postoId);
  const de = filtros.de || hojeISO();
  const ate = filtros.ate || hojeISO();

  const [postosTodos, dias] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    buscarFluxoCaixa({ postoIds, de, ate }),
  ]);

  const temFiltro = Boolean(postoIds.length || filtros.de || filtros.ate);

  const qsAtual = new URLSearchParams();
  postoIds.forEach((id) => qsAtual.append("postoId", id));
  qsAtual.set("de", de);
  qsAtual.set("ate", ate);
  const voltarPara = `/fluxo-de-caixa?${qsAtual.toString()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Fluxo de Caixa</h1>
        <BotaoImprimir />
      </div>
      <p className="text-sm text-foreground/60 print:hidden">
        Saldo Inicial, Recebimentos e Despesas Extras são preenchidos manual. Combustíveis vem de{" "}
        <Link href="/combustiveis-a-pagar" className="underline">
          Combustíveis a Pagar
        </Link>{" "}
        e Despesas vem de{" "}
        <Link href="/contas-a-pagar" className="underline">
          Contas a Pagar
        </Link>{" "}
        — os dois somados pela data de vencimento. Só dias úteis: o que vence em sábado, domingo ou feriado
        entra no próximo dia útil. Saldo Final = Saldo Inicial + Recebimentos − Combustíveis −
        Despesas − Despesas Extras.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm print:hidden">
        <div className="flex flex-col gap-1">
          <label className="text-foreground/60">Postos</label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postosTodos.map((p) => ({ id: p.id, nome: p.nome }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            De
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input
            id="ate"
            type="date"
            name="ate"
            defaultValue={ate}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/fluxo-de-caixa" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {podeEditar ? (
        <form action={salvarFluxoCaixa} className="space-y-4">
          <input type="hidden" name="voltarPara" value={voltarPara} />
          <TabelaFluxoCaixa dias={dias} podeEditar={podeEditar} />
          {dias.length > 0 && (
            <div className="flex justify-end print:hidden">
              <button
                type="submit"
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
              >
                Salvar
              </button>
            </div>
          )}
        </form>
      ) : (
        <TabelaFluxoCaixa dias={dias} podeEditar={podeEditar} />
      )}

      {dias.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhum dia útil no período escolhido.</p>
      )}
    </div>
  );
}
