import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeUTC } from "@/lib/datas";
import { paraLista, emLista, anexarLista } from "@/lib/filtro-multiplo";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { gerarOcorrenciasRecorrentesPendentes } from "./recorrencia";
import { excluirContaAPagar, excluirContasEmMassa } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { SelecionarTodos } from "@/components/ui/selecionar-todos";
import { ThOrdenavel } from "@/components/ui/th-ordenavel";
import { Paginacao } from "@/components/ui/paginacao";
import { lerParamsLista, ordenar, paginar } from "@/lib/lista";
import { BOTAO_EDITAR, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CABECALHO_TABELA, CAMPO, CARTAO, TITULO_PAGINA } from "@/lib/estilo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { ComentarioHover } from "@/components/ui/comentario-hover";

const MENSAGENS_ERRO: Record<string, string> = {
  "ja-paga": "Essa conta já foi paga — não dá mais pra excluir por aqui. Desfaça o pagamento em Despesas Pagas primeiro.",
};

// Contas pagas não aparecem mais aqui (decisão da usuária) — quem quiser ver
// o que já foi pago vai em Despesas Pagas. Aqui só sobra o que ainda precisa
// de atenção: vencida ou a vencer.
type StatusConta = "VENCIDA" | "A_VENCER";
const FORM_MASSA = "form-excluir-em-massa";

function statusDaConta(dataVencimento: Date, hoje: Date): StatusConta {
  return dataVencimento < hoje ? "VENCIDA" : "A_VENCER";
}

function BadgeStatus({ status }: { status: StatusConta }) {
  const estilos: Record<StatusConta, string> = {
    VENCIDA: "rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-xs font-semibold text-[#A12727] dark:bg-red-900/40 dark:text-red-400",
    A_VENCER: "rounded-full bg-[#EEF0F3] px-2.5 py-0.5 text-xs font-semibold text-[#374151] dark:bg-white/10 dark:text-foreground/70",
  };
  const rotulos: Record<StatusConta, string> = {
    VENCIDA: "Vencida",
    A_VENCER: "A vencer",
  };
  return (
    <span className={estilos[status]}>{rotulos[status]}</span>
  );
}

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{
    postoId?: string | string[];
    status?: string;
    de?: string;
    ate?: string;
    q?: string;
    erro?: string;
    ordem?: string;
    dir?: string;
    pagina?: string;
    porPagina?: string;
  }>;
}) {
  await exigirPermissao("CONTAS_A_PAGAR", "visualizar");
  const podeEditar = await podeEditarModulo("CONTAS_A_PAGAR");

  await gerarOcorrenciasRecorrentesPendentes();

  const { postoId, status, de, ate, q, erro, ordem, dir, pagina, porPagina } = await searchParams;
  const busca = q?.trim();
  const postoIds = paraLista(postoId);

  const [contas, postos] = await Promise.all([
    prisma.contaAPagar.findMany({
      where: {
        paga: false,
        // Combustível é aba própria (Combustíveis a Pagar) — não aparece
        // misturado aqui.
        combustivel: false,
        ...emLista("postoId", postoIds),
        ...(de || ate
          ? {
              dataVencimento: {
                ...(de ? { gte: dataUTC(de) } : {}),
                ...(ate ? { lte: dataUTC(ate) } : {}),
              },
            }
          : {}),
        // Busca por fornecedor OU descrição — não entra em Observação de
        // propósito (é informação de apoio pro pagamento, não algo que
        // ajuda a achar a despesa certa numa busca).
        ...(busca
          ? {
              OR: [
                { fornecedor: { nome: { contains: busca, mode: "insensitive" } } },
                { descricao: { contains: busca, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { posto: true, fornecedor: true, planoConta: { include: { grupo: true } } },
      orderBy: { dataVencimento: "asc" },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  const hoje = hojeUTC();
  const contasComStatus = contas
    .map((c) => ({ ...c, status: statusDaConta(c.dataVencimento, hoje) }))
    .filter((c) => !status || c.status === status);

  const total = contasComStatus.reduce((soma, c) => soma + Number(c.valor), 0);
  const temFiltro = Boolean(postoIds.length || status || de || ate || busca);

  // Relatório unificado (ver /relatorios) — chega de lá já filtrado só pra
  // A pagar (esse módulo). "de"/"ate" aqui já é vencimento, mesma coisa lá,
  // então carrega direto.
  const qsRelatorio = new URLSearchParams();
  qsRelatorio.set("status", "A_PAGAR");
  qsRelatorio.set("statusEnviado", "1");
  anexarLista(qsRelatorio, "postoId", postoIds);
  if (de) qsRelatorio.set("de", de);
  if (ate) qsRelatorio.set("ate", ate);
  const linkRelatorio = `/relatorios?${qsRelatorio.toString()}`;

  // "voltarPara": pra depois de criar ou editar uma conta, voltar exatamente
  // pro filtro que já estava aplicado aqui, em vez de cair na lista inteira
  // sem filtro nenhum (pedido da usuária — dava retrabalho de filtrar de
  // novo toda vez). Ver formulario-conta-a-pagar.tsx e actions.ts.
  const qsAtualParams = new URLSearchParams(
    Object.entries({ status, de, ate, q }).filter(([, v]) => v) as [string, string][]
  );
  anexarLista(qsAtualParams, "postoId", postoIds);
  const qsAtual = qsAtualParams.toString();

  // Ordenação por cabeçalho + paginação (10/25/50).
  const estado = lerParamsLista({ ordem, dir, pagina, porPagina }, { ordem: "vencimento", dir: "asc" }, ["vencimento", "posto", "fornecedor", "descricao", "valor", "status"]);
  const contasOrdenadas = ordenar(contasComStatus, estado.ordem, estado.dir, {
    vencimento: (c) => c.dataVencimento,
    posto: (c) => c.posto.nome,
    fornecedor: (c) => c.fornecedor.nome,
    descricao: (c) => c.descricao,
    valor: (c) => Number(c.valor),
    status: (c) => c.status,
  });
  const pag = paginar(contasOrdenadas, estado.pagina, estado.porPagina);
  const qsPaginacao = new URLSearchParams(qsAtual);
  qsPaginacao.set("ordem", estado.ordem);
  qsPaginacao.set("dir", estado.dir);
  const urlAtual = `/contas-a-pagar${qsAtual ? `?${qsAtual}` : ""}`;
  const qsVoltarPara = `voltarPara=${encodeURIComponent(urlAtual)}`;

  return (
    <div className="space-y-6">
      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={TITULO_PAGINA}>Contas a Pagar</h1>
          <p className="mt-1.5 text-sm text-foreground/60">
            Contas lançadas por vencimento. O pagamento é marcado na Conferência Diária.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={linkRelatorio}
            target="_blank"
            className={`${BOTAO_SECUNDARIO} text-sm font-medium`}
          >
            Relatório (imprimir / PDF)
          </Link>
          {podeEditar && (
            <Link
              href={`/contas-a-pagar/novo?${qsVoltarPara}`}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              + Nova conta
            </Link>
          )}
        </div>
      </div>

      <section aria-label="Resumo" className="flex flex-wrap gap-4">
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Contas no filtro</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{contasComStatus.length}</p>
        </div>
        <div className={`${CARTAO} min-w-[220px] flex-1 px-5 py-4`}>
          <p className="text-[13px] text-foreground/60">Total</p>
          <p className="mt-1.5 text-[28px] font-bold tracking-tight">{formatarMoeda(total)}</p>
        </div>
      </section>

      <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-foreground/60">
            Buscar
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Fornecedor ou descrição"
            className={`${CAMPO} min-w-[14rem]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <SeletorDropdown
            nome="postoId"
            rotuloTodos="Todos os postos"
            selecionados={postoIds}
            itens={postos.map((p) => ({ id: p.id, nome: p.nome }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-foreground/60">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className={CAMPO}
          >
            <option value="">Todos</option>
            <option value="A_VENCER">A vencer</option>
            <option value="VENCIDA">Vencida</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Vencimento de
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de ?? ""}
            className={CAMPO}
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
            defaultValue={ate ?? ""}
            className={CAMPO}
          />
        </div>
        <button type="submit" className={BOTAO_PRIMARIO}>
          Filtrar
        </button>
        {temFiltro && (
          <Link href="/contas-a-pagar" className="self-center text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <div className="flex items-center justify-end">
        {podeEditar && (
          <ConfirmSubmitButton
            form={FORM_MASSA}
            confirmMessage="Excluir todas as contas selecionadas? Essa ação não pode ser desfeita."
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Excluir selecionadas
          </ConfirmSubmitButton>
        )}
      </div>
      {podeEditar && <form id={FORM_MASSA} action={excluirContasEmMassa} />}

      <div className={`${CARTAO} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className={CABECALHO_TABELA}>
            <tr>
              {podeEditar && (
                <th className="px-4 py-2.5 text-left">
                  <SelecionarTodos formId={FORM_MASSA} />
                </th>
              )}
              <ThOrdenavel campo="vencimento" rotulo="Vencimento" base="/contas-a-pagar" qs={qsAtual} ordem={estado.ordem} dir={estado.dir} porPagina={estado.porPagina} />
              <ThOrdenavel campo="posto" rotulo="Posto" base="/contas-a-pagar" qs={qsAtual} ordem={estado.ordem} dir={estado.dir} porPagina={estado.porPagina} />
              <ThOrdenavel campo="fornecedor" rotulo="Fornecedor" base="/contas-a-pagar" qs={qsAtual} ordem={estado.ordem} dir={estado.dir} porPagina={estado.porPagina} />
              <ThOrdenavel campo="descricao" rotulo="Descrição" base="/contas-a-pagar" qs={qsAtual} ordem={estado.ordem} dir={estado.dir} porPagina={estado.porPagina} />
              <ThOrdenavel campo="valor" rotulo="Valor" alinhar="right" base="/contas-a-pagar" qs={qsAtual} ordem={estado.ordem} dir={estado.dir} porPagina={estado.porPagina} />
              <ThOrdenavel campo="status" rotulo="Status" base="/contas-a-pagar" qs={qsAtual} ordem={estado.ordem} dir={estado.dir} porPagina={estado.porPagina} />
              {podeEditar && <th className="px-4 py-2.5 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {pag.itens.map((c) => (
              <tr key={c.id} className="border-t border-black/10 hover:bg-black/[0.015] dark:border-white/10 dark:hover:bg-white/[0.03]">
                {podeEditar && (
                  <td className="px-4 py-3">
                    <input type="checkbox" name="ids" value={c.id} form={FORM_MASSA} />
                  </td>
                )}
                <td className="px-4 py-3">
                  {formatarData(c.dataVencimento)}
                  {c.totalParcelas ? (
                    <span className="block text-xs text-foreground/40">
                      parcela {c.numeroParcela}/{c.totalParcelas}
                    </span>
                  ) : null}
                  {c.recorrente ? (
                    <span className="block text-xs text-foreground/40">
                      recorrente{c.frequenciaRecorrencia === "SEMANAL" ? " (semanal)" : " (mensal)"}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{c.posto.nome}</td>
                <td className="px-4 py-3">{c.fornecedor.nome}</td>
                <td className="px-4 py-3 text-foreground/70">
                  {c.descricao ?? "—"}
                  {c.observacao && (
                    <>
                      {" "}
                      <ComentarioHover texto={c.observacao} />
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{formatarMoeda(c.valor.toString())}</td>
                <td className="px-4 py-3">
                  <BadgeStatus status={c.status} />
                </td>
                {podeEditar && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/contas-a-pagar/${c.id}/editar?${qsVoltarPara}`}
                        className={BOTAO_EDITAR}
                      >
                        Editar
                      </Link>
                      <form action={excluirContaAPagar}>
                        <input type="hidden" name="id" value={c.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Excluir essa conta a pagar (${c.fornecedor.nome}, ${formatarMoeda(c.valor.toString())})? Essa ação não pode ser desfeita.`}
                        >
                          Excluir
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {contasComStatus.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 8 : 6} className="px-4 py-6 text-center text-foreground/50">
                  Nenhuma conta a pagar encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Paginacao
        base="/contas-a-pagar"
        qs={qsPaginacao.toString()}
        pagina={pag.pagina}
        totalPaginas={pag.totalPaginas}
        total={pag.total}
        inicio={pag.inicio}
        mostrados={pag.itens.length}
        porPagina={estado.porPagina}
      />
    </div>
  );
}
