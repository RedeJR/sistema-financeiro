import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { paraLista } from "@/lib/filtro-multiplo";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { BOTAO_EDITAR, BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO, ETIQUETA_AZUL, ETIQUETA_VERMELHA, TITULO_PAGINA } from "@/lib/estilo";
import { conciliarBonificacoes, ROTULO_BANDEIRA, type Situacao } from "@/lib/combustiveis/bonificacao";
import type { BandeiraCombustivel } from "@/generated/prisma/client";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";
import { BotaoImprimir } from "./botao-imprimir";
import { excluirBonificacao } from "./actions";

function formatarNumero(n: number, casas = 2): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export const metadata = { title: "Bonificação Postecipada" };

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

const ETIQUETA_VERDE = "rounded-full bg-[#E6F6EC] px-2.5 py-0.5 text-xs font-semibold text-[#1B7A3E] dark:bg-green-900/40 dark:text-green-400";
const ETIQUETA_CINZA = "rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-foreground/60 dark:bg-white/10";
const ETIQUETA_AMBAR = "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-300";

const SITUACAO: Record<Situacao, { texto: string; classe: string }> = {
  CONCILIADA: { texto: "Conciliada", classe: ETIQUETA_VERDE },
  PARCIAL: { texto: "Recebido em parte", classe: ETIQUETA_AMBAR },
  A_RECEBER: { texto: "A receber", classe: ETIQUETA_VERMELHA },
  ACIMA: { texto: "Veio a mais", classe: ETIQUETA_AZUL },
  MANUAL: { texto: "Manual", classe: ETIQUETA_CINZA },
};

export default async function BonificacaoPostecipadaPage({
  searchParams,
}: {
  searchParams: Promise<{ postoId?: string | string[]; bandeira?: string; de?: string; ate?: string }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "visualizar");
  const filtros = await searchParams;
  const postoIds = paraLista(filtros.postoId);
  const bandeira = (["IPIRANGA", "VIBRA", "SHELL"] as const).find((b) => b === filtros.bandeira);

  const [postos, itens, podeEditar] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    conciliarBonificacoes({
      postoIds,
      bandeira: bandeira as BandeiraCombustivel | undefined,
      de: filtros.de ? dataUTC(filtros.de) : undefined,
      ate: filtros.ate ? dataUTC(filtros.ate) : undefined,
    }),
    podeEditarModulo("COMBUSTIVEIS_A_PAGAR"),
  ]);

  const totalLitros = itens.reduce((s, i) => s + i.litros, 0);
  const totalEsperado = itens.reduce((s, i) => s + i.esperado, 0);
  const totalRecebido = itens.reduce((s, i) => s + (i.recebido ?? 0), 0);
  const temFiltro = Boolean(postoIds.length || bandeira || filtros.de || filtros.ate);

  const nomesPostos = postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ");
  const periodoFiltro = filtros.de || filtros.ate ? `${filtros.de ? formatarData(dataUTC(filtros.de)) : "início"} a ${filtros.ate ? formatarData(dataUTC(filtros.ate)) : "hoje"}` : "";

  return (
    <div className="space-y-6">
      <OrientacaoImpressao />
      <CabecalhoImpressao
        titulo="Bonificação Postecipada"
        detalhes={[
          { rotulo: "Posto", valor: nomesPostos },
          { rotulo: "Fornecedor", valor: bandeira ? ROTULO_BANDEIRA[bandeira] : "" },
          { rotulo: "Período", valor: periodoFiltro },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className={TITULO_PAGINA}>Bonificação Postecipada</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoImprimir />
          {podeEditar && (
            <Link href="/bonificacao-postecipada/novo" className={`${BOTAO_PRIMARIO} flex items-center text-sm`}>
              + Nova bonificação
            </Link>
          )}
        </div>
      </div>

      <p className="max-w-4xl text-sm text-foreground/60 print:hidden">
        Desconto que cada posto tem a receber da distribuidora num período. <strong>Ipiranga</strong>: o sistema soma o desconto
        lançado nos boletos de combustível do posto com vencimento no período. <strong>Vibra</strong>: soma as transferências
        recebidas e marcadas no extrato como &quot;BONIFICAÇÃO VIBRA&quot;. <strong>Shell</strong>: acompanhamento manual.
      </p>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm print:hidden`}>
        <div className="flex flex-col gap-1">
          <label className="text-foreground/60">Posto</label>
          <SeletorDropdown nome="postoId" rotuloTodos="Todos os postos" selecionados={postoIds} itens={postos.map((p) => ({ id: p.id, nome: p.nome }))} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bandeira" className="text-foreground/60">
            Fornecedor
          </label>
          <select id="bandeira" name="bandeira" defaultValue={bandeira ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            <option value="IPIRANGA">Ipiranga</option>
            <option value="VIBRA">Vibra</option>
            <option value="SHELL">Shell</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Período de
          </label>
          <input id="de" name="de" type="date" defaultValue={filtros.de ?? ""} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ate" className="text-foreground/60">
            até
          </label>
          <input id="ate" name="ate" type="date" defaultValue={filtros.ate ?? ""} className={CAMPO} />
        </div>
        <button type="submit" className={BOTAO_PRIMARIO}>
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/bonificacao-postecipada" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      {itens.length === 0 ? (
        <p className="py-10 text-center text-sm text-foreground/50">Nenhuma bonificação cadastrada{temFiltro ? " nesse filtro" : ""}.</p>
      ) : (
        <div className={`${CARTAO} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className={CABECALHO_TABELA}>
              <tr>
                <th className="px-4 py-2.5 text-left">Fornecedor</th>
                <th className="px-4 py-2.5 text-left">Posto</th>
                <th className="px-4 py-2.5 text-left">Período</th>
                <th className="px-4 py-2.5 text-right">Retorno (R$/L)</th>
                <th className="px-4 py-2.5 text-right">Litragem</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5 text-right">Recebido</th>
                <th className="px-4 py-2.5 text-right">Diferença</th>
                <th className="px-4 py-2.5 text-left">Situação</th>
                <th className="px-4 py-2.5 text-left print:hidden">Obs.</th>
                {podeEditar && <th className="px-4 py-2.5 text-right print:hidden">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {itens.map((b) => (
                <tr key={b.id} className="border-t border-black/5 align-top dark:border-white/10">
                  <td className="px-4 py-3 font-medium">{ROTULO_BANDEIRA[b.bandeira]}</td>
                  <td className="px-4 py-3">{b.posto}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatarData(b.periodoDe)} a {formatarData(b.periodoAte)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatarNumero(b.retornoPorLitro, 4)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatarNumero(b.litros)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(b.esperado)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {b.recebido === null ? "—" : formatarMoeda(b.recebido)}
                    {b.origem.length > 0 && (
                      <details className="mt-1 text-left text-xs text-foreground/60">
                        <summary className="cursor-pointer text-right print:hidden">ver origem ({b.origem.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {b.origem.map((o, i) => (
                            <li key={i} className="flex justify-between gap-3 whitespace-nowrap">
                              <span>
                                {formatarData(o.data)} · {o.descricao}
                              </span>
                              <span>{formatarMoeda(o.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{b.diferenca === null ? "—" : formatarMoeda(b.diferenca)}</td>
                  <td className="px-4 py-3">
                    <span className={SITUACAO[b.situacao].classe}>{SITUACAO[b.situacao].texto}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground/70 print:hidden">{b.observacao ?? "—"}</td>
                  {podeEditar && (
                    <td className="px-4 py-3 print:hidden">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/bonificacao-postecipada/${b.id}/editar`} className={BOTAO_EDITAR}>
                          Editar
                        </Link>
                        <form action={excluirBonificacao}>
                          <input type="hidden" name="id" value={b.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`Excluir a bonificação ${ROTULO_BANDEIRA[b.bandeira]} de ${b.posto} (${formatarData(b.periodoDe)} a ${formatarData(b.periodoAte)})? Essa ação não pode ser desfeita.`}
                          >
                            Excluir
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-[#DCE7FA] font-bold dark:border-white/10 dark:bg-blue-950/40">
                <td className="px-4 py-3" colSpan={4}>
                  Total
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarNumero(totalLitros)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totalEsperado)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totalRecebido)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatarMoeda(totalRecebido - totalEsperado)}</td>
                <td colSpan={podeEditar ? 3 : 2} className="print:hidden"></td><td className="hidden print:table-cell"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
