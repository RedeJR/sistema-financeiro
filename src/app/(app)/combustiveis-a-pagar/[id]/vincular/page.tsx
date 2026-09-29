import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { buscarCandidatosCombustivel, buscarVinculadosCombustivel } from "@/lib/combustiveis/vinculo";
import { vincularCombustivel, desvincularCombustivel } from "../../actions";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoDe(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function somarDias(d: Date, dias: number): Date {
  const novo = new Date(d);
  novo.setUTCDate(novo.getUTCDate() + dias);
  return novo;
}

const JANELA_PADRAO_DIAS = 15;

export default async function VincularCombustivelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string; ate?: string; todasCategorias?: string; erro?: string; qtd?: string }>;
}) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const { id } = await params;
  const { de, ate, todasCategorias, erro, qtd } = await searchParams;

  const conta = await prisma.contaAPagar.findUnique({
    where: { id },
    include: { posto: true, postoPagamento: true, fornecedor: true },
  });
  if (!conta || !conta.combustivel) notFound();

  const dataInicio = de ? dataUTC(de) : somarDias(conta.dataVencimento, -JANELA_PADRAO_DIAS);
  const dataFim = ate ? dataUTC(ate) : somarDias(conta.dataVencimento, JANELA_PADRAO_DIAS);
  const mostrarTodasCategorias = todasCategorias === "1";

  const [vinculados, candidatos] = await Promise.all([
    buscarVinculadosCombustivel(id),
    buscarCandidatosCombustivel({ contaId: id, dataInicio, dataFim, todasCategorias: mostrarTodasCategorias }),
  ]);

  const valorConta = Number(conta.valor);
  const somaVinculada = vinculados.reduce((s, l) => s + Math.abs(l.valor), 0);
  const diferenca = valorConta - somaVinculada;
  const bate = vinculados.length > 0 && Math.abs(diferenca) <= 0.01;

  const qs = new URLSearchParams({ de: isoDe(dataInicio), ate: isoDe(dataFim) });
  if (mostrarTodasCategorias) qs.set("todasCategorias", "1");

  return (
    <div className="space-y-4">
      <div>
        <Link href="/combustiveis-a-pagar" className="text-sm text-foreground/60 underline">
          ← Voltar pra Combustíveis a Pagar
        </Link>
        <h1 className="text-lg font-medium">
          Vincular ao extrato — {conta.fornecedor.nome}, {formatarMoeda(valorConta)}
        </h1>
        <p className="text-sm text-foreground/60">
          {(conta.postoPagamento ?? conta.posto).nome} · vencimento {formatarData(conta.dataVencimento)}
          {conta.postoPagamentoId && (
            <span> — despesa de {conta.posto.nome}, paga pela conta de {conta.postoPagamento!.nome}</span>
          )}
        </p>
      </div>

      {erro === "ja-vinculado" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {qtd ?? "Um"} dos lançamentos selecionados já tinha sido vinculado a outra conta nesse meio tempo (por
          outra pessoa, ou outra aba) — os demais foram vinculados normalmente. Escolha outro lançamento pra
          esse aqui.
        </div>
      )}

      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          bate
            ? "border-green-500/30 bg-green-500/5"
            : somaVinculada > 0
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-black/10 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.02]"
        }`}
      >
        Valor da conta: <strong>{formatarMoeda(valorConta)}</strong> — vinculado até agora:{" "}
        <strong>{formatarMoeda(somaVinculada)}</strong>
        {somaVinculada > 0 && !bate && <span> — falta {formatarMoeda(diferenca)}</span>}
        {bate && <span> — bate certinho, conta já marcada como paga.</span>}
      </div>

      {vinculados.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
          <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
            Já vinculados a essa conta
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {vinculados.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <div>
                  <p className="font-medium">
                    {formatarData(l.data)} — {formatarMoeda(Math.abs(l.valor))}
                  </p>
                  <p className="text-foreground/60">
                    {l.bancoNome} · {l.categoriaNome ?? "sem categoria"} · {l.descricao}
                  </p>
                </div>
                <form action={desvincularCombustivel}>
                  <input type="hidden" name="contaId" value={id} />
                  <input type="hidden" name="lancamentoId" value={l.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Desvincular
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="de" className="text-foreground/60">
            Buscar extrato de
          </label>
          <input
            id="de"
            type="date"
            name="de"
            defaultValue={isoDe(dataInicio)}
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
            defaultValue={isoDe(dataFim)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-1.5 dark:border-white/20"
          />
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-foreground/70">
          <input type="checkbox" name="todasCategorias" value="1" defaultChecked={mostrarTodasCategorias} />
          Mostrar de todas as categorias (não só &quot;Combustíveis&quot;)
        </label>
        <button
          type="submit"
          className="rounded-md border border-black/15 px-4 py-1.5 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Buscar
        </button>
      </form>

      <form action={vincularCombustivel} className="space-y-2">
        <input type="hidden" name="contaId" value={id} />
        <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
          <div className="border-b border-black/10 bg-black/[0.02] px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-white/[0.02]">
            Lançamentos do extrato de {(conta.postoPagamento ?? conta.posto).nome} nesse período, ainda sem conta
            vinculada
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/10">
            {candidatos.map((l) => (
              <label key={l.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                <input type="checkbox" name="lancamentoId" value={l.id} />
                <div>
                  <p className="font-medium">
                    {formatarData(l.data)} — {formatarMoeda(Math.abs(l.valor))}
                  </p>
                  <p className="text-foreground/60">
                    {l.bancoNome} · {l.categoriaNome ?? "sem categoria"} · {l.descricao}
                  </p>
                </div>
              </label>
            ))}
            {candidatos.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-foreground/50">
                Nenhum lançamento sem conta vinculada nesse período. Tente ampliar as datas ou marcar &quot;todas as
                categorias&quot;.
              </p>
            )}
          </div>
        </div>
        {candidatos.length > 0 && (
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Vincular selecionados
          </button>
        )}
      </form>
    </div>
  );
}
