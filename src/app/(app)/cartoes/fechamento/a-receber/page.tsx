import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { agruparEmBlocos, buscarVendasAReceber, formatarPeriodoVendas, type BaseAReceber } from "@/lib/cartoes/aReceber";
import { BotaoImprimir } from "../botao-imprimir";

function dataUTC(iso: string, fim = false): Date {
  return new Date(`${iso}T${fim ? "23:59:59.999" : "00:00:00.000"}Z`);
}

const CLASSE_CAMPO = "rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20";

export default async function VendasAReceberPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; inicio?: string; fim?: string; adquirenteId?: string; base?: string }>;
}) {
  const { postoId, inicio, fim, adquirenteId, base: baseParam } = await searchParams;
  const base: BaseAReceber = baseParam === "recebimento" ? "recebimento" : "venda";

  const [postos, adquirentes] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.adquirenteCartao.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);

  const temFiltro = Boolean(inicio && fim);
  const linhas = temFiltro
    ? await buscarVendasAReceber({
        postoId: postoId || undefined,
        adquirenteId: adquirenteId || undefined,
        dataInicio: dataUTC(inicio!),
        dataFim: dataUTC(fim!, true),
        base,
      })
    : null;

  const postosBlocos = linhas ? agruparEmBlocos(linhas) : [];
  const totalGeral = postosBlocos.reduce((s, p) => s + p.total, 0);
  const totalSemData = linhas?.reduce((s, l) => s + l.qtdSemDataRepasse, 0) ?? 0;

  const postoNome = postos.find((p) => p.id === postoId)?.nome;
  const qsBase = new URLSearchParams({ inicio: inicio ?? "", fim: fim ?? "", base });
  if (postoId) qsBase.set("postoId", postoId);
  if (adquirenteId) qsBase.set("adquirenteId", adquirenteId);
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });
  const descricaoBase = base === "venda" ? "vendas do período ainda não recebidas" : "vendas com recebimento previsto no período";

  return (
    <div className="space-y-4">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">
          Valores a receber — {postoNome ?? "Todos os postos"} — {inicio} a {fim}
        </h2>
        <p className="text-xs text-foreground/60">
          {descricaoBase} · Gerado em {geradoEm}
        </p>
      </div>

      <p className="text-sm text-foreground/60 print:hidden">
        Valores de cartão que ainda vão cair na conta. Por data da venda: vendas feitas no período que não tinham sido
        pagas até o último dia dele. Por data de recebimento: vendas cujo pagamento previsto cai dentro do período.
      </p>

      <form className="flex flex-wrap items-end gap-3 text-sm print:hidden">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select id="postoId" name="postoId" defaultValue={postoId ?? ""} className={CLASSE_CAMPO}>
            <option value="">Todos os postos</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adquirenteId" className="text-foreground/60">
            Adquirente
          </label>
          <select id="adquirenteId" name="adquirenteId" defaultValue={adquirenteId ?? ""} className={CLASSE_CAMPO}>
            <option value="">Todas</option>
            {adquirentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="base" className="text-foreground/60">
            Considerar por
          </label>
          <select id="base" name="base" defaultValue={base} className={CLASSE_CAMPO}>
            <option value="venda">Data da venda</option>
            <option value="recebimento">Data de recebimento</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="inicio" className="text-foreground/60">
            Período — de
          </label>
          <input id="inicio" type="date" name="inicio" defaultValue={inicio ?? ""} required className={CLASSE_CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fim" className="text-foreground/60">
            até
          </label>
          <input id="fim" type="date" name="fim" defaultValue={fim ?? ""} required className={CLASSE_CAMPO} />
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/cartoes/fechamento/a-receber" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
        {temFiltro && (
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/cartoes/fechamento/a-receber/exportar?${qsBase.toString()}`}
              className="rounded-md border border-black/15 px-3 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Exportar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </form>

      {!linhas && <p className="py-10 text-center text-sm text-foreground/50">Escolha o período pra ver os valores a receber.</p>}

      {linhas && linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma venda a receber nesse período/filtro.</p>
      )}

      {linhas && linhas.length > 0 && (
        <div className="space-y-4">
          {totalSemData > 0 && (
            <p className="text-xs text-foreground/60">
              {totalSemData} venda(s) sem data de repasse cadastrada (ex: VR) estão incluídas por data da venda.
            </p>
          )}
          {postosBlocos.map((p) => (
            <div key={p.postoId} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
                {p.posto}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-1.5 text-left font-medium">Adquirente</th>
                    <th className="px-4 py-1.5 text-right font-medium">Valor Bruto</th>
                    <th className="px-4 py-1.5 text-left font-medium">Período</th>
                  </tr>
                </thead>
                {p.blocos.map((bloco) => (
                  <tbody key={bloco.titulo}>
                    <tr className="border-t border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
                      <td className="px-4 py-1 text-xs font-semibold uppercase text-foreground/60" colSpan={3}>
                        {bloco.titulo}
                      </td>
                    </tr>
                    {bloco.linhas.map((l) => (
                      <tr key={l.rotulo} className="border-t border-black/5 dark:border-white/10">
                        <td className="px-4 py-1.5">{l.rotulo}</td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">{l.bruto === 0 ? "—" : formatarMoeda(l.bruto)}</td>
                        <td className="px-4 py-1.5 whitespace-nowrap">{l.de && l.ate ? formatarPeriodoVendas(l.de, l.ate) : ""}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-black/10 font-semibold dark:border-white/10">
                      <td className="px-4 py-1.5">Total {bloco.titulo.toLowerCase()}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(bloco.total)}</td>
                      <td />
                    </tr>
                  </tbody>
                ))}
                <tfoot>
                  <tr className="border-t border-black/10 bg-black/[0.03] font-semibold dark:border-white/10 dark:bg-white/[0.04]">
                    <td className="px-4 py-1.5">Total {p.posto}</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(p.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}

          {postosBlocos.length > 1 && (
            <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="bg-blue-950/10 font-semibold dark:bg-blue-950/25">
                    <td className="px-4 py-1.5">Total geral</td>
                    <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(totalGeral)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
