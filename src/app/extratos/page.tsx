import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarLancamentosExtrato, contribuicoesPorCategoria, type FiltrosExtratos } from "./consulta";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

type Lancamento = Awaited<ReturnType<typeof buscarLancamentosExtrato>>["lancamentos"][number];

type GrupoDia = {
  chave: string;
  data: Date;
  postoId: string;
  postoNome: string;
  bancoId: string;
  bancoNome: string;
  quantidade: number;
  total: number;
  subtotais: { nome: string; valor: number }[];
};

// Agrupa por dia + posto + banco (não só por dia — sem isso, ao ver "Todos"
// os postos de uma vez, um mesmo dia misturaria contas de postos/bancos
// diferentes no mesmo bloco) e, dentro de cada bloco, soma por categoria —
// a tela de resumo mostra só isso (nada editável, nada lançamento a
// lançamento). Pra corrigir algo, o lápis leva pra /extratos/editar naquele
// bloco específico.
function agruparPorDia(lancamentos: Lancamento[]): GrupoDia[] {
  const grupos: GrupoDia[] = [];
  const porChave = new Map<string, GrupoDia>();
  const somaPorChaveECategoria = new Map<string, Map<string, number>>();

  for (const l of lancamentos) {
    const chave = `${l.data.toISOString()}_${l.postoId}_${l.bancoId}`;
    let g = porChave.get(chave);
    if (!g) {
      g = {
        chave,
        data: l.data,
        postoId: l.postoId,
        postoNome: l.posto.nome,
        bancoId: l.bancoId,
        bancoNome: l.banco.nome,
        quantidade: 0,
        total: 0,
        subtotais: [],
      };
      porChave.set(chave, g);
      somaPorChaveECategoria.set(chave, new Map());
      grupos.push(g);
    }
    g.quantidade += 1;
    g.total += Number(l.valor);

    const somaCategorias = somaPorChaveECategoria.get(chave)!;
    for (const { nome, valor } of contribuicoesPorCategoria(l)) {
      somaCategorias.set(nome, (somaCategorias.get(nome) ?? 0) + valor);
    }
  }

  for (const g of grupos) {
    const somaCategorias = somaPorChaveECategoria.get(g.chave)!;
    g.subtotais = Array.from(somaCategorias.entries())
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  }

  return grupos;
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

export default async function ExtratosPage({
  searchParams,
}: {
  searchParams: Promise<FiltrosExtratos>;
}) {
  await exigirPermissao("EXTRATOS", "visualizar");
  const podeEditar = await podeEditarModulo("EXTRATOS");

  const filtros = await searchParams;
  const { postoId, bancoId, categoria, de, ate } = filtros;

  const [resultado, postos, bancos, categorias] = await Promise.all([
    buscarLancamentosExtrato(filtros),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.categoriaExtrato.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } }),
  ]);

  const { lancamentos, total, totalSemCategoria, somaValor, pagina, totalPaginas } = resultado;
  const temFiltro = Boolean(postoId || bancoId || categoria || de || ate);
  const grupos = agruparPorDia(lancamentos);

  const qsSemPagina = construirQuery(filtros, ["pagina"]);
  const linkPagina = (p: number) => `/extratos?${qsSemPagina}${qsSemPagina ? "&" : ""}pagina=${p}`;

  // Link do lápis: mesmos filtros, mas travado no dia + posto + banco
  // daquele bloco específico.
  const linkEditarBloco = (g: GrupoDia) => {
    const dia = g.data.toISOString().slice(0, 10);
    const qs = construirQuery(
      { ...filtros, postoId: g.postoId, bancoId: g.bancoId, de: dia, ate: dia },
      ["pagina"]
    );
    return `/extratos/editar?${qs}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Conciliação de Extratos</h1>
        <div className="flex gap-2">
          <Link
            href="/extratos/conciliacao"
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Conciliação
          </Link>
          <Link
            href="/extratos/fechamento"
            className="rounded-md border border-black/15 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Fechamento
          </Link>
          {podeEditar && (
            <Link
              href="/extratos/importar"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              + Importar extrato
            </Link>
          )}
        </div>
      </div>

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
          <Link href="/extratos" className="text-foreground/60 underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <p className="text-sm text-foreground/60">
        {total} lançamento{total === 1 ? "" : "s"} — total {formatarMoeda(somaValor)}
        {totalSemCategoria > 0 && (
          <>
            {" · "}
            <Link href="/extratos/editar?categoria=sem" className="text-amber-700 underline dark:text-amber-500">
              {totalSemCategoria} sem categoria
            </Link>
          </>
        )}
      </p>

      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.chave} className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            <div className="flex items-center justify-between gap-2 border-b border-black/10 bg-black/[0.03] px-4 py-2 dark:border-white/10 dark:bg-white/[0.04]">
              <span className="text-sm font-semibold text-foreground/80">
                {formatarData(g.data)} — {g.postoNome} — {g.bancoNome} — {g.quantidade} lançamento
                {g.quantidade === 1 ? "" : "s"} — total {formatarMoeda(g.total)}
              </span>
              {podeEditar && (
                <Link
                  href={linkEditarBloco(g)}
                  title="Editar lançamentos do dia"
                  aria-label="Editar lançamentos do dia"
                  className="rounded-md px-2 py-1 text-base hover:bg-black/10 dark:hover:bg-white/10"
                >
                  ✏️
                </Link>
              )}
            </div>
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {g.subtotais.map((s) => (
                <div key={s.nome} className="flex items-center justify-between px-4 py-1.5 text-sm">
                  <span className={s.nome === "sem categoria" ? "text-amber-700 dark:text-amber-500" : "text-foreground/80"}>
                    {s.nome}
                  </span>
                  <span className={s.valor < 0 ? "text-red-700 dark:text-red-400" : ""}>
                    {formatarMoeda(s.valor)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {grupos.length === 0 && (
          <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
            Nenhum lançamento encontrado pra esse filtro.
          </p>
        )}
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
