import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarLancamentosExtrato, contribuicoesPorCategoria, type FiltrosExtratos } from "../consulta";
import { LinhaEditavel } from "../linha-editavel";
import { DivisaoLancamento } from "../divisao-lancamento";
import { GrupoRepetido } from "../grupo-repetido";
import { reatribuirLancamentos, excluirLancamentosEmMassa, atualizarCategoriaEmMassa } from "../actions";
import { SelecionarTodos } from "@/components/ui/selecionar-todos";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

const FORM_REATRIBUIR = "form-reatribuir-lancamentos";
const ROTA = "/extratos/editar";

const MENSAGENS_ERRO: Record<string, string> = {
  "nenhum-selecionado": "Selecione ao menos um lançamento antes de aplicar a mudança.",
  "nada-pra-mudar": "Escolha um novo Posto ou um novo Banco pra aplicar.",
  "duplicado-apos-mudanca": "Um ou mais lançamentos selecionados já existem no Posto/Banco de destino — confira antes de tentar de novo.",
  "sem-categoria-em-massa": "Escolha uma categoria no bloco do dia antes de salvar.",
};

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Valor selecionado no <select> de categoria da linha (ver linha-editavel.tsx):
// "" sem categoria, "<id>" categoria padrão, "<id>:DEBITO"/"<id>:CREDITO" adquirente.
function valorSelecaoCategoria(
  categoriaId: string | null,
  tipo: "ADQUIRENTE" | "PADRAO" | undefined,
  tipoAdquirente: "DEBITO" | "CREDITO" | null
): string {
  if (!categoriaId) return "";
  if (tipo === "ADQUIRENTE") return `${categoriaId}:${tipoAdquirente ?? "CREDITO"}`;
  return categoriaId;
}

function nomeCategoriaComTipo(
  categoria: { nome: string } | null,
  tipoAdquirente: "DEBITO" | "CREDITO" | null
): string {
  if (!categoria) return "sem categoria";
  return `${categoria.nome}${tipoAdquirente ? ` ${tipoAdquirente === "DEBITO" ? "Déb." : "Créd."}` : ""}`;
}

type Lancamento = Awaited<ReturnType<typeof buscarLancamentosExtrato>>["lancamentos"][number];

type GrupoDia = {
  chave: string;
  data: Date;
  itens: Lancamento[];
  total: number;
  subtotais: { nome: string; valor: number }[];
};

// Agrupa a lista (já ordenada por data desc) em blocos por dia, com
// subtotal por categoria dentro de cada bloco.
function agruparPorDia(lancamentos: Lancamento[]): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  const porChave = new Map<string, GrupoDia>();

  for (const l of lancamentos) {
    const chave = l.data.toISOString();
    let g = porChave.get(chave);
    if (!g) {
      g = { chave, data: l.data, itens: [], total: 0, subtotais: [] };
      porChave.set(chave, g);
      grupos.push(g);
    }
    g.itens.push(l);
    g.total += Number(l.valor);
  }

  for (const g of grupos) {
    const somaPorNome = new Map<string, number>();
    for (const l of g.itens) {
      for (const { nome, valor } of contribuicoesPorCategoria(l)) {
        somaPorNome.set(nome, (somaPorNome.get(nome) ?? 0) + valor);
      }
    }
    g.subtotais = Array.from(somaPorNome.entries()).map(([nome, valor]) => ({ nome, valor }));
  }

  return grupos;
}

// Uma "unidade" pra renderizar dentro de um bloco de dia: ou um lançamento
// sozinho (comportamento de sempre), ou um grupo de repetidos (ver
// GrupoRepetido) — várias linhas com mesmo posto+banco+categoria+descrição
// no mesmo dia, resumidas numa linha só. Alguns extratos (PagSeguro, que não
// agrupa vendas) geram centenas de linhas idênticas num único dia; sem isso
// a tela de revisão fica pesada e repetitiva demais pra ler.
type UnidadeLinha = { tipo: "unico"; item: Lancamento } | { tipo: "repetido"; chave: string; itens: Lancamento[] };

// Lançamento dividido (ver DivisaoLancamento) sempre fica de fora do
// agrupamento — cada parte precisa da própria UI de edição, juntar isso
// numa linha resumida esconderia informação que ela precisa ver.
function agruparRepetidos(itens: Lancamento[]): UnidadeLinha[] {
  const porChave = new Map<string, Lancamento[]>();
  const ordemChaves: string[] = [];

  for (const l of itens) {
    if (l.divisoes.length > 0) continue;
    const chave = `${l.postoId}|${l.bancoId}|${l.categoriaId ?? "sem"}|${l.tipoAdquirente ?? ""}|${l.descricao}`;
    if (!porChave.has(chave)) {
      porChave.set(chave, []);
      ordemChaves.push(chave);
    }
    porChave.get(chave)!.push(l);
  }

  const chaveComRepeticao = new Map(ordemChaves.map((c) => [c, porChave.get(c)!.length > 1]));

  const unidades: UnidadeLinha[] = [];
  const jaRepresentado = new Set<string>();
  for (const l of itens) {
    if (l.divisoes.length > 0) {
      unidades.push({ tipo: "unico", item: l });
      continue;
    }
    const chave = `${l.postoId}|${l.bancoId}|${l.categoriaId ?? "sem"}|${l.tipoAdquirente ?? ""}|${l.descricao}`;
    if (!chaveComRepeticao.get(chave)) {
      unidades.push({ tipo: "unico", item: l });
      continue;
    }
    if (jaRepresentado.has(chave)) continue; // já entrou como grupo na primeira ocorrência
    jaRepresentado.add(chave);
    unidades.push({ tipo: "repetido", chave, itens: porChave.get(chave)! });
  }

  return unidades;
}

function construirQuery(
  filtros: Record<string, string | string[] | undefined>,
  excluir: string[] = []
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (excluir.includes(k) || v === undefined || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, item);
    } else {
      sp.append(k, v);
    }
  }
  return sp.toString();
}

export default async function EditarExtratosPage({
  searchParams,
}: {
  searchParams: Promise<
    FiltrosExtratos & { erro?: string; gravados?: string; duplicados?: string; foraDoPeriodo?: string }
  >;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");
  const podeEditar = await podeEditarModulo("EXTRATOS");

  const filtros = await searchParams;
  const { postoId, bancoId, categoria, de, ate, arquivo, erro, gravados, duplicados, foraDoPeriodo } = filtros;

  const [resultado, postos, bancos, categorias] = await Promise.all([
    buscarLancamentosExtrato(filtros),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.categoriaExtrato.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
  ]);

  const { lancamentos, total, totalSemCategoria, somaValor, pagina, totalPaginas } = resultado;
  const temFiltro = Boolean(postoId || bancoId || categoria || de || ate || arquivo);
  const grupos = agruparPorDia(lancamentos);

  const qsSemPagina = construirQuery(filtros, ["pagina", "erro", "gravados", "duplicados", "foraDoPeriodo"]);
  const linkPagina = (p: number) => `${ROTA}?${qsSemPagina}${qsSemPagina ? "&" : ""}pagina=${p}`;

  // URL completa da visão atual (filtros + página) — as ações em massa usam
  // isso pra voltar exatamente pra onde a usuária estava.
  const qsAtual = construirQuery(filtros, ["erro"]);
  const urlAtual = `${ROTA}${qsAtual ? `?${qsAtual}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/extratos" className="text-sm text-foreground/60 underline">
            ← Voltar pro resumo
          </Link>
          <h1 className="text-2xl font-semibold">Editar lançamentos</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/extratos/fechamento"
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Fechamento
          </Link>
          {podeEditar && (
            <Link
              href="/extratos/importar"
              className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              + Importar extrato
            </Link>
          )}
          {/* Sempre visível, não só logo depois de um import — ela pode voltar
              aqui em qualquer momento só pra ajustar categorias e precisa de
              um jeito de confirmar "terminei" mesmo fora do fluxo de import. */}
          <Link
            href="/extratos"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Concluir revisão →
          </Link>
        </div>
      </div>

      {erro && MENSAGENS_ERRO[erro] && <ErroFormulario mensagem={MENSAGENS_ERRO[erro]} />}

      {gravados !== undefined && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-400">
          Extrato importado: {gravados} lançamento{gravados === "1" ? "" : "s"} novo
          {gravados === "1" ? "" : "s"}
          {duplicados && duplicados !== "0" ? ` · ${duplicados} já existia${duplicados === "1" ? "" : "m"}` : ""}
          {foraDoPeriodo && foraDoPeriodo !== "0"
            ? ` · ${foraDoPeriodo} fora do período selecionado (não importado)`
            : ""}
          . Revise as categorias abaixo e clique em &quot;Concluir revisão&quot; quando terminar.
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-foreground/60">
            Posto
          </label>
          <select
            id="postoId"
            name="postoId"
            defaultValue={postoId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos</option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bancoId" className="text-foreground/60">
            Banco
          </label>
          <select
            id="bancoId"
            name="bancoId"
            defaultValue={bancoId ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todos</option>
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="categoria" className="text-foreground/60">
            Categoria
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categoria ?? ""}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          >
            <option value="">Todas</option>
            <option value="sem">Sem categoria (revisar)</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            De
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={de ?? ""}
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
            defaultValue={ate ?? ""}
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
          <Link href={ROTA} className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-foreground/60">
          {total} lançamento{total === 1 ? "" : "s"} — total {formatarMoeda(somaValor)}
          {totalSemCategoria > 0 && (
            <>
              {" · "}
              <Link href={`${ROTA}?categoria=sem`} className="text-amber-700 underline dark:text-amber-500">
                {totalSemCategoria} sem categoria
              </Link>
            </>
          )}
        </p>
      </div>

      {podeEditar && (
        <form
          id={FORM_REATRIBUIR}
          action={reatribuirLancamentos}
          className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
        >
          <input type="hidden" name="voltarPara" value={urlAtual} />
          <p className="w-full text-foreground/60">
            Selecione lançamentos abaixo pra corrigir Posto e/ou Banco em lote, ou excluir em massa. Pra
            categorizar em massa, marque os lançamentos e use o seletor no cabeçalho de cada dia.
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="novoPostoId" className="text-foreground/60">
              Mudar Posto para
            </label>
            <select
              id="novoPostoId"
              name="novoPostoId"
              form={FORM_REATRIBUIR}
              defaultValue=""
              className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
            >
              <option value="">(não mudar)</option>
              {postos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="novoBancoId" className="text-foreground/60">
              Mudar Banco para
            </label>
            <select
              id="novoBancoId"
              name="novoBancoId"
              form={FORM_REATRIBUIR}
              defaultValue=""
              className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
            >
              <option value="">(não mudar)</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            form={FORM_REATRIBUIR}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Aplicar às selecionadas
          </button>
          <ConfirmSubmitButton
            form={FORM_REATRIBUIR}
            formAction={excluirLancamentosEmMassa}
            confirmMessage="Excluir os lançamentos selecionados? Essa ação não pode ser desfeita."
            className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Excluir selecionadas
          </ConfirmSubmitButton>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              {podeEditar && (
                <th className="px-4 py-2 text-left font-medium">
                  <SelecionarTodos formId={FORM_REATRIBUIR} />
                </th>
              )}
              <th className="px-4 py-2 text-left font-medium">Posto</th>
              <th className="px-4 py-2 text-left font-medium">Banco</th>
              <th className="px-4 py-2 text-left font-medium">Descrição</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 text-left font-medium">Categoria / Observação</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.chave}>
                <tr className="border-t border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]">
                  <td colSpan={podeEditar ? 6 : 5} className="px-4 py-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground/70">
                        {formatarData(g.data)} — {g.itens.length} lançamento{g.itens.length === 1 ? "" : "s"} —
                        total {formatarMoeda(g.total)}
                      </span>
                      {podeEditar && (
                        <div className="flex items-center gap-1">
                          <select
                            name={`categoriaEmMassa_${g.chave}`}
                            form={FORM_REATRIBUIR}
                            defaultValue=""
                            className="rounded border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
                          >
                            <option value="" disabled>
                              Categoria em massa
                            </option>
                            {categorias.map((c) =>
                              c.tipo === "ADQUIRENTE" ? (
                                <optgroup key={c.id} label={c.nome}>
                                  <option value={`${c.id}:DEBITO`}>{c.nome} Débito</option>
                                  <option value={`${c.id}:CREDITO`}>{c.nome} Crédito</option>
                                </optgroup>
                              ) : (
                                <option key={c.id} value={c.id}>
                                  {c.nome}
                                </option>
                              )
                            )}
                          </select>
                          <button
                            type="submit"
                            form={FORM_REATRIBUIR}
                            formAction={atualizarCategoriaEmMassa}
                            className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                          >
                            Salvar
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
                {agruparRepetidos(g.itens).map((u) =>
                  u.tipo === "repetido" ? (
                    <GrupoRepetido
                      key={u.chave}
                      grupoId={u.chave.replace(/[^a-zA-Z0-9]/g, "_")}
                      descricao={u.itens[0].descricao}
                      categoriaAtual={valorSelecaoCategoria(
                        u.itens[0].categoriaId,
                        u.itens[0].categoria?.tipo,
                        u.itens[0].tipoAdquirente
                      )}
                      categoriaLabel={nomeCategoriaComTipo(u.itens[0].categoria, u.itens[0].tipoAdquirente)}
                      itens={u.itens.map((l) => ({
                        id: l.id,
                        postoNome: l.posto.nome,
                        bancoNome: l.banco.nome,
                        valor: l.valor.toString(),
                        observacaoAtual: l.observacao ?? "",
                      }))}
                      categorias={categorias}
                      podeEditar={podeEditar}
                      formIdReatribuir={FORM_REATRIBUIR}
                      voltarPara={urlAtual}
                    />
                  ) : (
                    <tr key={u.item.id} className="border-t border-black/10 dark:border-white/10 align-top">
                      {podeEditar && (
                        <td className="px-4 py-2">
                          <input type="checkbox" name="ids" value={u.item.id} form={FORM_REATRIBUIR} />
                        </td>
                      )}
                      <td className="px-4 py-2">{u.item.posto.nome}</td>
                      <td className="px-4 py-2">{u.item.banco.nome}</td>
                      <td className="px-4 py-2 text-foreground/70">{u.item.descricao}</td>
                      <td
                        className={`px-4 py-2 text-right whitespace-nowrap ${
                          Number(u.item.valor) < 0 ? "text-red-700 dark:text-red-400" : ""
                        }`}
                      >
                        {formatarMoeda(u.item.valor.toString())}
                      </td>
                      <td className="px-4 py-2">
                        {u.item.divisoes.length > 0 ? (
                          <div className="text-foreground/70">
                            {u.item.divisoes.map((d, i) => (
                              <div key={d.id ?? i}>
                                {nomeCategoriaComTipo(d.categoria, d.tipoAdquirente)} —{" "}
                                {formatarMoeda(d.valor.toString())}
                              </div>
                            ))}
                          </div>
                        ) : podeEditar ? (
                          <LinhaEditavel
                            id={u.item.id}
                            categoriaAtual={valorSelecaoCategoria(
                              u.item.categoriaId,
                              u.item.categoria?.tipo,
                              u.item.tipoAdquirente
                            )}
                            observacaoAtual={u.item.observacao ?? ""}
                            categorias={categorias}
                          />
                        ) : (
                          <span className="text-foreground/70">
                            {nomeCategoriaComTipo(u.item.categoria, u.item.tipoAdquirente)}
                            {u.item.observacao && ` — ${u.item.observacao}`}
                          </span>
                        )}
                        {podeEditar && (
                          <DivisaoLancamento
                            lancamentoId={u.item.id}
                            valorTotal={Number(u.item.valor)}
                            divisoesAtuais={u.item.divisoes.map((d) => ({
                              categoriaId: d.categoriaId,
                              tipoAdquirente: d.tipoAdquirente,
                              valor: Number(d.valor),
                            }))}
                            categorias={categorias}
                          />
                        )}
                      </td>
                    </tr>
                  )
                )}
                <tr className="border-t border-dashed border-black/10 dark:border-white/10">
                  <td colSpan={podeEditar ? 6 : 5} className="px-4 py-1.5 text-xs text-foreground/60">
                    Subtotal: {g.subtotais.map((s) => `${s.nome} ${formatarMoeda(s.valor)}`).join(" · ")}
                  </td>
                </tr>
              </Fragment>
            ))}
            {lancamentos.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 6 : 5} className="px-4 py-6 text-center text-foreground/50">
                  Nenhum lançamento encontrado pra esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Link
            href={linkPagina(pagina - 1)}
            aria-disabled={pagina <= 1}
            className={`rounded-md border border-black/15 px-3 py-1.5 dark:border-white/20 ${
              pagina <= 1 ? "pointer-events-none opacity-40" : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            ← Anterior
          </Link>
          <span className="text-foreground/60">
            Página {pagina} de {totalPaginas}
          </span>
          <Link
            href={linkPagina(pagina + 1)}
            aria-disabled={pagina >= totalPaginas}
            className={`rounded-md border border-black/15 px-3 py-1.5 dark:border-white/20 ${
              pagina >= totalPaginas ? "pointer-events-none opacity-40" : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            Próxima →
          </Link>
        </div>
      )}
    </div>
  );
}
