import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarRelatorioCaixa } from "@/lib/cartoes/relatorio";
import { BotaoImprimir } from "./botao-imprimir";
import { registrarConferenciaCaixa } from "./actions";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO } from "@/lib/estilo";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function paraDatetimeUTC(valor: string): Date {
  // datetime-local vem como "AAAA-MM-DDTHH:MM", sem fuso — trata como UTC
  // direto, mesmo padrão de data usado no resto do sistema.
  return new Date(`${valor}:00.000Z`);
}

function formatarTurno(v?: string): string {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : (v ?? "");
}

export default async function RelatorioCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string; inicio?: string; fim?: string; rever?: string }>;
}) {
  const { postoId, inicio, fim, rever } = await searchParams;

  const [postos, podeEditar] = await Promise.all([
    prisma.posto.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    podeEditarModulo("CONFERENCIA_CAIXA"),
  ]);

  const temFiltro = Boolean(postoId && inicio && fim);
  // "Rever" (Histórico de Conferência) só preenche posto e período, sem
  // rodar a pesquisa — quem está revendo baixa/confere o arquivo de novo e
  // aí clica em Filtrar.
  const executar = temFiltro && rever !== "1";
  const relatorio =
    executar && postoId && inicio && fim
      ? await buscarRelatorioCaixa({
          postoId,
          inicio: paraDatetimeUTC(inicio),
          fim: paraDatetimeUTC(fim),
        })
      : null;

  const postoNome = postos.find((p) => p.id === postoId)?.nome;
  const qsBase = new URLSearchParams({ postoId: postoId ?? "", inicio: inicio ?? "", fim: fim ?? "" });
  const geradoEm = new Date().toLocaleString("pt-BR", { timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <OrientacaoImpressao />
      <CabecalhoImpressao titulo="Relatório de Caixa" detalhes={[{ rotulo: "Posto", valor: postoNome }, { rotulo: "Turno", valor: `${formatarTurno(inicio)} a ${formatarTurno(fim)}` }]} />

      <div className="flex flex-wrap items-end gap-3 text-sm print:hidden">
      <form key={`${postoId}|${inicio}|${fim}`} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            required
            className={CAMPO}
          >
            <option value="" disabled>
              Escolha um posto
            </option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="inicio" className="text-foreground/60">
            Início do turno
          </label>
          <input
            id="inicio"
            type="datetime-local"
            name="inicio"
            defaultValue={inicio ?? ""}
            required
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fim" className="text-foreground/60">
            Fim do turno
          </label>
          <input
            id="fim"
            type="datetime-local"
            name="fim"
            defaultValue={fim ?? ""}
            required
            className={CAMPO}
          />
        </div>
        <button
          type="submit"
          className={BOTAO_PRIMARIO}
        >
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/conferencia-caixa/relatorio" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>
        {relatorio && relatorio.linhas.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {podeEditar && (
              <>
                <form action={registrarConferenciaCaixa}>
                  <input type="hidden" name="postoId" value={postoId} />
                  <input type="hidden" name="inicio" value={inicio} />
                  <input type="hidden" name="fim" value={fim} />
                  <input type="hidden" name="status" value="CONFERIDO" />
                  <button
                    type="submit"
                    className="rounded-md border border-green-700/40 px-3 py-1.5 text-green-700 hover:bg-green-50 dark:border-green-400/40 dark:text-green-400 dark:hover:bg-green-900/20"
                  >
                    Conferido
                  </button>
                </form>
                <form action={registrarConferenciaCaixa}>
                  <input type="hidden" name="postoId" value={postoId} />
                  <input type="hidden" name="inicio" value={inicio} />
                  <input type="hidden" name="fim" value={fim} />
                  <input type="hidden" name="status" value="DIVERGENTE" />
                  <button
                    type="submit"
                    className="rounded-md border border-red-700/40 px-3 py-1.5 text-red-700 hover:bg-red-50 dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Divergente
                  </button>
                </form>
              </>
            )}
            <Link
              href={`/conferencia-caixa/relatorio/exportar?${qsBase.toString()}`}
              className={`${BOTAO_SECUNDARIO} font-medium`}
            >
              Baixar (Excel)
            </Link>
            <BotaoImprimir />
          </div>
        )}
      </div>
      <p className="text-xs text-foreground/50 print:hidden">
        O fim pode ser no dia seguinte ao início — útil pra turnos que viram a noite (ex: 06:00 de um dia
        até 06:00 do dia seguinte).
      </p>

      {!relatorio && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Escolha um posto e o período do turno pra ver as vendas encontradas.
        </p>
      )}

      {relatorio && relatorio.linhas.length === 0 && (
        <p className="py-10 text-center text-sm text-foreground/50">
          Nenhuma venda encontrada nesse posto/período. Confira se os arquivos já foram importados na aba
          Upload dos Arquivos.
        </p>
      )}

      {relatorio && relatorio.linhas.length > 0 && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
              Resumo por adquirente
            </div>
            <table className="w-full text-sm">
              <thead className={CABECALHO_TABELA}>
                <tr>
                  <th className="px-4 py-2.5 text-left">Adquirente</th>
                  <th className="px-4 py-2.5 text-right">Qtd</th>
                  <th className="px-4 py-2.5 text-right">Valor bruto</th>
                  <th className="px-4 py-2.5 text-right">Taxa</th>
                  <th className="px-4 py-2.5 text-right">Valor líquido</th>
                </tr>
              </thead>
              <tbody>
                {relatorio.resumo.map((r, i) => (
                  <tr
                    key={r.adquirente}
                    className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                  >
                    <td className="px-4 py-3">{r.adquirente}</td>
                    <td className="px-4 py-1.5 text-right">{r.qtd}</td>
                    <td className="px-4 py-1.5 text-right">{formatarMoeda(r.totalBruto)}</td>
                    <td className="px-4 py-1.5 text-right">{formatarMoeda(r.totalTaxa)}</td>
                    <td className="px-4 py-1.5 text-right">{formatarMoeda(r.totalLiquido)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-black/10 bg-[#DCE7FA] font-bold dark:border-white/10 dark:bg-blue-950/40">
                  <td className="px-4 py-3">Total geral</td>
                  <td className="px-4 py-1.5 text-right">{relatorio.linhas.length}</td>
                  <td className="px-4 py-1.5 text-right">{formatarMoeda(relatorio.totalBruto)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="border-b border-black/10 bg-black/[0.02] px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-white/[0.02]">
              Detalhamento das vendas
            </div>
            <div className="max-h-[32rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-black/[0.02] dark:bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Data</th>
                    <th className="px-4 py-2.5 text-left">Hora</th>
                    <th className="px-4 py-2.5 text-left">Adquirente</th>
                    <th className="px-4 py-2.5 text-left">Modalidade</th>
                    <th className="px-4 py-2.5 text-right">Valor bruto</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas.map((l, i) => (
                    <tr
                      key={l.id}
                      className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}
                    >
                      <td className="px-4 py-1.5 whitespace-nowrap">{formatarData(l.dataVenda)}</td>
                      <td className="px-4 py-1.5 whitespace-nowrap">{l.horaVenda || "—"}</td>
                      <td className="px-4 py-3">{l.adquirente}</td>
                      <td className="px-4 py-1.5 text-foreground/70">{l.tipoVenda}</td>
                      <td className="px-4 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valorBruto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
