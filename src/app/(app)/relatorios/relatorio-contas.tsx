import Link from "next/link";
import { Fragment } from "react";
import { prisma } from "@/lib/prisma";
import { formatarMoeda } from "@/lib/dinheiro";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { CabecalhoImpressao } from "@/components/ui/cabecalho-impressao";
import { OrientacaoImpressao } from "@/components/ui/orientacao-impressao";
import { AvisoPadraoDia } from "@/components/ui/aviso-padrao-dia";
import { padraoDeDatas } from "@/lib/datas-padrao";
import { BOTAO_PRIMARIO, CAMPO, TITULO_PAGINA } from "@/lib/estilo";
import { BotaoImprimir } from "./botao-imprimir";
import { buscarRelatorio, agruparEm, dimensaoDe, DIMENSOES, type FiltrosRelatorio, type NoRelatorio } from "./consulta";

// Tela única dos relatórios de contas (Despesas > Contas a Pagar > Relatório, Conciliação > Despesas Pagas >
// Relatório e Despesas > Contas Pagas): mesmos filtros, mesmo agrupamento em até dois níveis e mesma tabela.
// Só mudam o título, a situação (em "contas-pagas" é sempre "paga", sem caixinha) e o padrão do filtro de
// posto/data — ver os dois usos em relatorios/page.tsx e contas-pagas/page.tsx.

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function paraArray(v?: string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function dataBR(iso?: string): string | null {
  return iso ? iso.split("-").reverse().join("/") : null;
}

function intervalo(de?: string, ate?: string): string | null {
  return de || ate ? `${dataBR(de) ?? "início"} a ${dataBR(ate) ?? "sem limite"}` : null;
}

export async function RelatorioContas({
  modo,
  filtros: filtrosBrutos,
}: {
  modo: "relatorios" | "contas-pagas";
  filtros: FiltrosRelatorio;
}) {
  const soPagas = modo === "contas-pagas";
  const base = soPagas ? "/contas-pagas" : "/relatorios";
  const titulo = soPagas ? "Contas Pagas" : "Relatórios";

  // Contas Pagas abre só no último dia útil (vencimento); se a URL já traz qualquer data (inclusive a de
  // pagamento), vale o que veio.
  const temDataNaUrl = filtrosBrutos.pagde !== undefined || filtrosBrutos.pagate !== undefined;
  const padraoData = soPagas && !temDataNaUrl ? padraoDeDatas(filtrosBrutos.de, filtrosBrutos.ate, "ontem") : { de: filtrosBrutos.de, ate: filtrosBrutos.ate, padrao: false };
  const filtros = { ...filtrosBrutos, de: padraoData.de, ate: padraoData.ate };

  const statusSelecionado = paraArray(filtros.status);
  const postoIds = paraArray(filtros.postoId);
  const fornecedorIds = paraArray(filtros.fornecedorId);
  const planoContaIds = paraArray(filtros.planoContaId);

  // Antes do primeiro "Filtrar" (sem "statusEnviado" na URL) as duas situações aparecem marcadas — é só visual,
  // a consulta já mostra tudo nesse estado. Depois de enviado, vale o que estiver marcado, inclusive nada.
  const statusPagaMarcado = !filtros.statusEnviado || statusSelecionado.includes("PAGA");
  const statusAPagarMarcado = !filtros.statusEnviado || statusSelecionado.includes("A_PAGAR");

  // Posto: "Pagador" marcado = quem pagou (traz também o que ele pagou de outros postos); desmarcado = dono da
  // despesa. Relatórios abre marcado (sempre foi por quem pagou); Contas Pagas abre desmarcado (pedido da usuária).
  const pagador = soPagas ? filtros.postoPagador === "1" : !filtros.statusEnviado || filtros.postoPagador === "1";

  const dim1 = dimensaoDe(filtros.ordem) ?? "vencimento";
  const dim2Bruta = dimensaoDe(filtros.ordem2);
  const dim2 = dim2Bruta && dim2Bruta !== dim1 ? dim2Bruta : null;

  const [linhas, postos, fornecedores, gruposPlanoConta] = await Promise.all([
    buscarRelatorio({
      ...filtros,
      postoPagador: pagador ? "1" : undefined,
      ...(soPagas ? { status: "PAGA", statusEnviado: "1" } : {}),
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" } } },
    }),
  ]);

  const total = linhas.reduce((soma, l) => soma + Number(l.valor), 0);
  const grupos = agruparEm(linhas, dim2 ? [dim1, dim2] : [dim1]);

  const temFiltro = Boolean(
    (!soPagas && filtros.statusEnviado) ||
      postoIds.length ||
      pagador !== !soPagas ||
      fornecedorIds.length ||
      planoContaIds.length ||
      filtros.de ||
      filtros.ate ||
      filtros.pagde ||
      filtros.pagate ||
      (filtros.ordem && filtros.ordem !== "vencimento") ||
      filtros.ordem2
  );

  const rotuloDim = (v: string) => DIMENSOES.find((d) => d.valor === v)!.rotulo.split(" (")[0];
  const nomesPostos = postoIds.length ? postos.filter((p) => postoIds.includes(p.id)).map((p) => p.nome).join(", ") : null;
  const situacaoImpressa = soPagas
    ? null
    : statusPagaMarcado && statusAPagarMarcado
      ? "Pagas e a pagar"
      : statusPagaMarcado
        ? "Pagas"
        : statusAPagarMarcado
          ? "A pagar"
          : "Nenhuma";

  const linhaTabela = (l: (typeof linhas)[number], i: number) => (
    <tr key={l.id} className={`border-t border-black/5 dark:border-white/10 ${i % 2 === 1 ? "bg-black/[0.015] dark:bg-white/[0.02]" : ""}`}>
      <td className="px-3 py-1.5 whitespace-nowrap">{formatarData(l.dataVencimento)}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {l.dataPagamento ? formatarData(l.dataPagamento) : <span className="text-foreground/40">a pagar</span>}
      </td>
      <td className="px-3 py-1.5">
        {(l.postoPagamento ?? l.posto).nome}
        {l.postoPagamentoId && <span className="block text-xs text-foreground/50">despesa de {l.posto.nome}</span>}
      </td>
      <td className="px-3 py-1.5">{l.fornecedor.nome}</td>
      <td className="px-3 py-1.5 text-foreground/70">
        {l.planoConta.grupo.nome} / {l.planoConta.nome}
      </td>
      <td className="px-3 py-1.5 text-foreground/70">{l.descricao ?? "—"}</td>
      <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatarMoeda(l.valor.toString())}</td>
    </tr>
  );

  // Cabeçalho de grupo: 1º nível mais forte, 2º nível mais leve e recuado. O total fica na coluna Valor.
  function renderNo(no: NoRelatorio, nivel: 0 | 1) {
    const estilo =
      nivel === 0
        ? "border-t border-black/10 bg-blue-950/10 font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25"
        : "border-t border-black/10 bg-black/[0.04] text-[13px] font-semibold text-foreground/75 dark:border-white/10 dark:bg-white/[0.06]";
    return (
      <Fragment key={no.chave}>
        <tr className={estilo}>
          <td className={`py-2.5 pr-3 ${nivel === 0 ? "pl-3" : "pl-8"}`} colSpan={6}>
            {no.subtitulo ? `${no.subtitulo} / ${no.titulo}` : no.titulo} — {no.quantidade} conta{no.quantidade === 1 ? "" : "s"}
          </td>
          <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatarMoeda(no.total)}</td>
        </tr>
        {no.filhos.map((f) => renderNo(f, 1))}
        {no.linhas.map(linhaTabela)}
      </Fragment>
    );
  }

  return (
    <div className="space-y-6">
      <OrientacaoImpressao />
      <div className="flex items-center justify-between print:hidden">
        <h1 className={TITULO_PAGINA}>{titulo}</h1>
        <BotaoImprimir />
      </div>
      <CabecalhoImpressao
        titulo={soPagas ? "Contas Pagas" : "Relatório de Contas"}
        detalhes={[
          { rotulo: "Situação", valor: situacaoImpressa },
          { rotulo: pagador ? "Posto (quem pagou)" : "Posto (dono da despesa)", valor: nomesPostos },
          { rotulo: "Vencimento", valor: intervalo(filtros.de, filtros.ate) },
          { rotulo: "Pagamento", valor: intervalo(filtros.pagde, filtros.pagate) },
          { rotulo: "Agrupado por", valor: dim2 ? `${rotuloDim(dim1)} > ${rotuloDim(dim2)}` : rotuloDim(dim1) },
        ]}
      />

      {padraoData.padrao && <AvisoPadraoDia modo="ontem" dia={filtros.de!} />}
      <form className="space-y-3 text-sm print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          {!soPagas && (
            <div className="flex flex-col gap-1">
              <span className="text-foreground/60">Situação</span>
              <div className="flex h-10 items-center gap-3 rounded-lg border border-black/15 bg-white px-3 dark:border-white/20 dark:bg-transparent">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="status" value="PAGA" defaultChecked={statusPagaMarcado} />
                  Pagas
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" name="status" value="A_PAGAR" defaultChecked={statusAPagarMarcado} />
                  A pagar
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Posto</label>
            <SeletorDropdown nome="postoId" rotuloTodos="Todos os postos" selecionados={postoIds} itens={postos.map((p) => ({ id: p.id, nome: p.nome }))} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Fornecedor</label>
            <SeletorDropdown
              nome="fornecedorId"
              rotuloTodos="Todos os fornecedores"
              selecionados={fornecedorIds}
              itens={fornecedores.map((f) => ({ id: f.id, nome: f.nome, documento: f.documento }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Plano de contas</label>
            <SeletorDropdown
              nome="planoContaId"
              rotuloTodos="Todos os planos de conta"
              selecionados={planoContaIds}
              grupos={gruposPlanoConta.map((g) => ({ id: g.id, nome: g.nome, itens: g.contas.map((c) => ({ id: c.id, nome: c.nome })) }))}
            />
          </div>

          <fieldset className="flex items-end gap-2">
            <legend className="mb-1 text-foreground/60">Vencimento</legend>
            <input type="date" name="de" defaultValue={filtros.de ?? ""} aria-label="Vencimento de" className={CAMPO} />
            <span className="pb-2 text-foreground/50">a</span>
            <input type="date" name="ate" defaultValue={filtros.ate ?? ""} aria-label="Vencimento até" className={CAMPO} />
          </fieldset>

          <fieldset className="flex items-end gap-2">
            <legend className="mb-1 text-foreground/60">Pagamento</legend>
            <input type="date" name="pagde" defaultValue={filtros.pagde ?? ""} aria-label="Pagamento de" className={CAMPO} />
            <span className="pb-2 text-foreground/50">a</span>
            <input type="date" name="pagate" defaultValue={filtros.pagate ?? ""} aria-label="Pagamento até" className={CAMPO} />
          </fieldset>
        </div>

        {/* "Pagador" marcado filtra por quem PAGOU (escolher a OLIVEIRA traz também o que ela pagou pra outros
            postos); desmarcado, pelo dono da despesa. Fica numa linha própria pra não desalinhar as caixas. */}
        <label className="flex w-fit items-center gap-1.5 text-xs text-foreground/60">
          <input type="checkbox" name="postoPagador" value="1" defaultChecked={pagador} />
          Pagador — filtrar o posto por quem pagou (desmarcado: pelo dono da despesa)
        </label>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="ordem" className="text-foreground/60">
              Agrupar por
            </label>
            <select id="ordem" name="ordem" defaultValue={dim1} className={CAMPO}>
              {DIMENSOES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ordem2" className="text-foreground/60">
              Depois por
            </label>
            <select id="ordem2" name="ordem2" defaultValue={dim2 ?? ""} className={CAMPO}>
              <option value="">— só um nível —</option>
              {DIMENSOES.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </div>

          {!soPagas && <input type="hidden" name="statusEnviado" value="1" />}
          <button type="submit" className={BOTAO_PRIMARIO}>
            Filtrar
          </button>
          {temFiltro && (
            <Link href={base} className="self-center text-foreground/60 underline">
              Limpar filtros
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-foreground/60">
        {linhas.length} conta{linhas.length === 1 ? "" : "s"} — total {formatarMoeda(total)}
      </p>

      {/* Uma tabela só pro documento inteiro, sempre com as mesmas 7 colunas na mesma ordem (qualquer
          agrupamento): os títulos de grupo são linhas dentro dela, com o total na coluna Valor. Impresso/PDF
          não pode ter largura mínima (a página é mais estreita) — as % do colgroup repartem o que sobrar. */}
      {grupos.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-black/10 print:overflow-visible dark:border-white/15">
          <table className="w-full min-w-[940px] table-fixed text-sm [&_td]:break-words print:min-w-0">
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "19%" }} />
              <col />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead className="bg-black/[0.04] dark:bg-white/[0.05]">
              <tr>
                <th className="px-3 py-2.5 text-left">Vencimento</th>
                <th className="px-3 py-2.5 text-left">Pagamento</th>
                <th className="px-3 py-2.5 text-left">Posto</th>
                <th className="px-3 py-2.5 text-left">Fornecedor</th>
                <th className="px-3 py-2.5 text-left">Plano de contas</th>
                <th className="px-3 py-2.5 text-left">Descrição</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.chave}>{renderNo(g, 0)}</tbody>
            ))}
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
          Nenhuma conta encontrada pra esse filtro.
        </p>
      )}

      <div className="flex items-center justify-between rounded-lg bg-blue-950/10 px-4 py-2 text-sm font-semibold text-foreground/80 dark:bg-blue-950/25">
        <span>
          Total do período — {linhas.length} conta{linhas.length === 1 ? "" : "s"}
        </span>
        <span>{formatarMoeda(total)}</span>
      </div>
    </div>
  );
}
