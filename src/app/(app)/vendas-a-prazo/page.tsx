import Link from "next/link";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { paraLista, emLista } from "@/lib/filtro-multiplo";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { rodarVinculoAutomaticoVendasAPrazo } from "@/lib/vendasAPrazo/vinculo";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";
import { BotaoImprimir } from "./botao-imprimir";
import { excluirVendaAPrazo } from "./actions";
import { BOTAO_EDITAR, BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO } from "@/lib/estilo";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

type Situacao = "CONCILIADA" | "A_RECEBER" | "ATRASADA";

const SITUACOES: { valor: Situacao; rotulo: string }[] = [
  { valor: "A_RECEBER", rotulo: "A receber" },
  { valor: "ATRASADA", rotulo: "Atrasada (sem crédito no extrato)" },
  { valor: "CONCILIADA", rotulo: "Conciliada" },
];

const ESTILO: Record<Situacao, string> = {
  CONCILIADA: "bg-[#E7F6EC] text-[#14693A] dark:bg-green-900/40 dark:text-green-400",
  A_RECEBER: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400",
  ATRASADA: "bg-[#FDECEC] text-[#A12727] dark:bg-red-900/40 dark:text-red-400",
};

export const metadata = { title: "Vendas a Prazo" };

export default async function VendasAPrazoPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; q?: string; situacao?: string; de?: string; ate?: string; pde?: string; pate?: string }>;
}) {
  const { postoId, q, situacao, de, ate, pde, pate } = await searchParams;
  const postoIds = paraLista(postoId);
  const situacaoFiltro = SITUACOES.find((s) => s.valor === situacao)?.valor;
  const podeEditar = await podeEditarModulo("VENDAS_A_PRAZO");
  const hoje = hojeUTC();

  // Vínculo automático com o extrato (idempotente, só liga o que é 1-pra-1 sem dúvida). Só quem pode editar
  // dispara: visualização não deve ter efeito colateral no banco.
  if (podeEditar) await rodarVinculoAutomaticoVendasAPrazo();

  const [postos, todas] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.vendaAPrazo.findMany({
      where: {
        ...emLista("postoId", postoIds),
        ...(q?.trim() ? { cliente: { contains: q.trim(), mode: "insensitive" as const } } : {}),
        ...(de || ate ? { dataPagamento: { ...(de ? { gte: dataUTC(de) } : {}), ...(ate ? { lte: dataUTC(ate) } : {}) } } : {}),
        // Período do abastecimento: pega toda venda cujo período encosta no intervalo escolhido.
        ...(pde ? { periodoAte: { gte: dataUTC(pde) } } : {}),
        ...(pate ? { periodoDe: { lte: dataUTC(pate) } } : {}),
      },
      include: { posto: true, lancamentoExtrato: { include: { banco: true } } },
      orderBy: [{ dataPagamento: "asc" }, { cliente: "asc" }],
    }),
  ]);

  const situacaoDe = (v: (typeof todas)[number]): Situacao => (v.lancamentoExtratoId ? "CONCILIADA" : v.dataPagamento < hoje ? "ATRASADA" : "A_RECEBER");
  const vendas = situacaoFiltro ? todas.filter((v) => situacaoDe(v) === situacaoFiltro) : todas;
  const soma = (s: Situacao) => todas.filter((v) => situacaoDe(v) === s).reduce((t, v) => t + Number(v.valor), 0);
  const qtd = (s: Situacao) => todas.filter((v) => situacaoDe(v) === s).length;
  const total = vendas.reduce((t, v) => t + Number(v.valor), 0);
  const temFiltro = Boolean(postoIds.length || q || situacaoFiltro || de || ate || pde || pate);

  const fmtIso = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : null);
  const intervalo = (a?: string, b?: string) => (a || b ? `${fmtIso(a) ?? "início"} a ${fmtIso(b) ?? "hoje em diante"}` : null);
  const nomesPostos = postoIds.length ? postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ") : null;

  return (
    <div className="space-y-6">
      <OrientacaoImpressao />
      <CabecalhoImpressao
        titulo="Vendas a Prazo"
        detalhes={[
          { rotulo: "Posto", valor: nomesPostos },
          { rotulo: "Cliente", valor: q?.trim() },
          { rotulo: "Período do abastecimento", valor: intervalo(pde, pate) },
          { rotulo: "Pagamento", valor: intervalo(de, ate) },
          { rotulo: "Situação", valor: situacaoFiltro ? SITUACOES.find((s) => s.valor === situacaoFiltro)!.rotulo.split(" (")[0] : null },
        ]}
      />
      <p className="text-sm text-foreground/60 print:hidden">
        Venda de combustível a cliente com pagamento depois. Cada registro (cliente, período do abastecimento, valor total e data de pagamento) é
        ligado ao crédito que entrar no extrato do posto, e a categoria dele vira &quot;VENDA A PRAZO&quot;.
      </p>

      <section aria-label="Resumo" className="flex flex-wrap gap-4">
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">A receber ({qtd("A_RECEBER")})</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight">{formatarMoeda(soma("A_RECEBER"))}</p>
        </div>
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Atrasadas ({qtd("ATRASADA")})</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[#A12727]">{formatarMoeda(soma("ATRASADA"))}</p>
        </div>
        <div className={`${CARTAO} min-w-[200px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Conciliadas ({qtd("CONCILIADA")})</p>
          <p className="mt-1.5 text-[24px] font-bold tracking-tight text-[#14693A]">{formatarMoeda(soma("CONCILIADA"))}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <BotaoImprimir />
          {podeEditar && (
            <>
              <Link href="/vendas-a-prazo/importar" className="rounded-lg border border-black/15 bg-white px-3.5 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10">
                Importar planilha
              </Link>
              <a href="/vendas-a-prazo/importar/modelo" className="rounded-lg border border-black/15 bg-white px-3.5 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:bg-transparent dark:hover:bg-white/10">
                Baixar modelo
              </a>
            </>
          )}
        </div>
        {podeEditar && (
          <Link href="/vendas-a-prazo/novo" className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            + Nova venda a prazo
          </Link>
        )}
      </div>

      <form className={`${CARTAO} space-y-4 px-5 py-4 text-sm print:hidden`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="q" className="text-foreground/60">
              Cliente
            </label>
            <input id="q" name="q" defaultValue={q ?? ""} placeholder="Buscar pelo nome" className={`${CAMPO} min-w-[14rem]`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Posto</label>
            <SeletorDropdown nome="postoId" rotuloTodos="Todos os postos" selecionados={postoIds} itens={postos.map((p) => ({ id: p.id, nome: p.nome }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="situacao" className="text-foreground/60">
              Status
            </label>
            <select id="situacao" name="situacao" defaultValue={situacaoFiltro ?? ""} className={CAMPO}>
              <option value="">Todos</option>
              {SITUACOES.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <fieldset className="flex items-end gap-2">
            <legend className="mb-1 text-foreground/60">Período do abastecimento</legend>
            <input type="date" name="pde" defaultValue={pde ?? ""} aria-label="Período do abastecimento de" className={CAMPO} />
            <span className="pb-1.5 text-foreground/50">a</span>
            <input type="date" name="pate" defaultValue={pate ?? ""} aria-label="Período do abastecimento até" className={CAMPO} />
          </fieldset>
          <fieldset className="flex items-end gap-2">
            <legend className="mb-1 text-foreground/60">Data de pagamento</legend>
            <input type="date" name="de" defaultValue={de ?? ""} aria-label="Pagamento de" className={CAMPO} />
            <span className="pb-1.5 text-foreground/50">a</span>
            <input type="date" name="ate" defaultValue={ate ?? ""} aria-label="Pagamento até" className={CAMPO} />
          </fieldset>
          <div className="flex items-center gap-4 pb-0.5">
            <button type="submit" className={BOTAO_PRIMARIO}>
              Filtrar
            </button>
            {temFiltro && (
              <Link href="/vendas-a-prazo" className="text-foreground/60 underline">
                Limpar filtros
              </Link>
            )}
          </div>
        </div>
      </form>

      {vendas.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma venda a prazo{temFiltro ? " nesse filtro" : " lançada"}.</p>
      ) : (
        <div className={`${CARTAO} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                <th className="px-4 py-2.5 text-left">Posto</th>
                <th className="px-4 py-2.5 text-left">Cliente</th>
                <th className="px-4 py-2.5 text-left">Período do abastecimento</th>
                <th className="px-4 py-2.5 text-right">Valor total</th>
                <th className="px-4 py-2.5 text-left">Pagamento</th>
                <th className="px-4 py-2.5 text-left">Situação</th>
                <th className="px-4 py-2.5 text-left">Extrato</th>
                {podeEditar && <th className="px-4 py-2.5 text-right print:hidden">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {vendas.map((v, i) => {
                const sit = situacaoDe(v);
                return (
                  <tr key={v.id} className={`border-t border-black/5 align-top dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}>
                    <td className="px-4 py-3">{v.posto.nome}</td>
                    <td className="px-4 py-3 font-medium break-words">
                      {v.cliente}
                      {v.observacao && <span className="block text-xs font-normal text-foreground/50">{v.observacao}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatarData(v.periodoDe)} a {formatarData(v.periodoAte)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(Number(v.valor))}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatarData(v.dataPagamento)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${ESTILO[sit]}`}>
                        {SITUACOES.find((s) => s.valor === sit)!.rotulo.split(" (")[0]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground/70">
                      {v.lancamentoExtrato ? (
                        <span className="whitespace-nowrap">
                          {formatarData(v.lancamentoExtrato.data)} · {v.lancamentoExtrato.banco.nome}
                        </span>
                      ) : podeEditar ? (
                        <>
                          <Link href={`/vendas-a-prazo/${v.id}/vincular`} className="text-blue-700 underline print:hidden dark:text-blue-300">
                            Vincular
                          </Link>
                          <span className="hidden print:inline">não conciliada</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    {podeEditar && (
                      <td className="px-4 py-3 print:hidden">
                        <div className="flex items-center justify-end gap-1">
                          {v.lancamentoExtrato && (
                            <Link href={`/vendas-a-prazo/${v.id}/vincular`} className="rounded-md px-3 py-1.5 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10">
                              Extrato
                            </Link>
                          )}
                          <Link href={`/vendas-a-prazo/${v.id}/editar`} className={BOTAO_EDITAR}>
                            Editar
                          </Link>
                          <form action={excluirVendaAPrazo}>
                            <input type="hidden" name="id" value={v.id} />
                            <ConfirmSubmitButton confirmMessage={`Excluir a venda a prazo de ${v.cliente} (${formatarMoeda(Number(v.valor))})? Essa ação não pode ser desfeita.`}>
                              Excluir
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-[#DCE7FA] font-bold dark:border-white/10 dark:bg-blue-950/40">
                <td className="px-4 py-3" colSpan={3}>
                  Total — {vendas.length} venda{vendas.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(total)}</td>
                <td colSpan={podeEditar ? 4 : 3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
