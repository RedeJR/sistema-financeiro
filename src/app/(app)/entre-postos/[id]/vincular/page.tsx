import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { sugerirCandidatosVinculo, type CandidatoLancamento } from "@/lib/entrePostos/vinculo";
import { vincularAoExtrato, desvincularDoExtrato } from "../../actions";

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function BlocoLado({
  titulo,
  postoNome,
  valorEsperado,
  movimentacaoId,
  ladoValor,
  vinculado,
  candidatos,
}: {
  titulo: string;
  postoNome: string;
  valorEsperado: number;
  movimentacaoId: string;
  ladoValor: "origem" | "destino";
  vinculado: { id: string; data: Date; descricao: string; valor: number; categoriaNome: string | null; bancoNome: string } | null;
  candidatos: CandidatoLancamento[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
      <div className="border-b border-black/10 bg-blue-950/10 px-4 py-1.5 text-sm font-semibold text-foreground/80 dark:border-white/10 dark:bg-blue-950/25">
        {titulo} — {postoNome} ({formatarMoeda(valorEsperado)})
      </div>
      <div className="p-3">
        {vinculado ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
            <div>
              <p className="font-medium">{formatarData(vinculado.data)} — {formatarMoeda(vinculado.valor)}</p>
              <p className="text-foreground/60">
                {vinculado.bancoNome} · {vinculado.categoriaNome ?? "sem categoria"} · {vinculado.descricao}
              </p>
            </div>
            <form action={desvincularDoExtrato}>
              <input type="hidden" name="movimentacaoId" value={movimentacaoId} />
              <input type="hidden" name="lado" value={ladoValor} />
              <button
                type="submit"
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Desvincular
              </button>
            </form>
          </div>
        ) : candidatos.length === 0 ? (
          <p className="text-sm text-foreground/50">
            Nenhum lançamento de {formatarMoeda(valorEsperado)} encontrado no extrato de {postoNome} (±5 dias). Pode
            ser repasse em espécie, ou o extrato ainda não foi importado.
          </p>
        ) : (
          <div className="space-y-1.5">
            {candidatos.map((c) => (
              <form key={c.id} action={vincularAoExtrato} className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15">
                <input type="hidden" name="movimentacaoId" value={movimentacaoId} />
                <input type="hidden" name="lado" value={ladoValor} />
                <input type="hidden" name="lancamentoExtratoId" value={c.id} />
                <div>
                  <p className="font-medium">{formatarData(c.data)} — {formatarMoeda(c.valor)}</p>
                  <p className="text-foreground/60">
                    {c.bancoNome} · {c.categoriaNome ?? "sem categoria"} · {c.descricao}
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                >
                  Vincular
                </button>
              </form>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function VincularMovimentacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("ENTRE_POSTOS", "editar");
  const { id } = await params;

  const mov = await prisma.movimentacaoEntrePostos.findUnique({
    where: { id },
    include: {
      postoOrigem: true,
      postoDestino: true,
      lancamentoExtratoOrigem: { include: { categoria: true, banco: true } },
      lancamentoExtratoDestino: { include: { categoria: true, banco: true } },
    },
  });
  if (!mov) notFound();

  const { origemCandidatos, destinoCandidatos } = await sugerirCandidatosVinculo(id);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/entre-postos" className="text-sm text-foreground/60 underline">
          ← Voltar pra Movimentações
        </Link>
        <h2 className="text-lg font-medium">
          Vincular ao extrato — {mov.tipo === "EMPRESTIMO" ? "Empréstimo" : "Devolução"} de {formatarMoeda(Number(mov.valor))} em{" "}
          {formatarData(mov.data)}
        </h2>
        <p className="text-sm text-foreground/60">
          {mov.postoOrigem.nome} → {mov.postoDestino.nome}. Ligue essa movimentação ao lançamento real do banco em
          cada lado — a categoria dele vira &quot;ENTRE POSTOS&quot; automaticamente, pra não contar duplicado no
          Fechamento de Extratos.
        </p>
      </div>

      <BlocoLado
        titulo="Lado de quem manda"
        postoNome={mov.postoOrigem.nome}
        valorEsperado={-Number(mov.valor)}
        movimentacaoId={mov.id}
        ladoValor="origem"
        vinculado={
          mov.lancamentoExtratoOrigem
            ? {
                id: mov.lancamentoExtratoOrigem.id,
                data: mov.lancamentoExtratoOrigem.data,
                descricao: mov.lancamentoExtratoOrigem.descricao,
                valor: Number(mov.lancamentoExtratoOrigem.valor),
                categoriaNome: mov.lancamentoExtratoOrigem.categoria?.nome ?? null,
                bancoNome: mov.lancamentoExtratoOrigem.banco.nome,
              }
            : null
        }
        candidatos={origemCandidatos}
      />

      <BlocoLado
        titulo="Lado de quem recebe"
        postoNome={mov.postoDestino.nome}
        valorEsperado={Number(mov.valor)}
        movimentacaoId={mov.id}
        ladoValor="destino"
        vinculado={
          mov.lancamentoExtratoDestino
            ? {
                id: mov.lancamentoExtratoDestino.id,
                data: mov.lancamentoExtratoDestino.data,
                descricao: mov.lancamentoExtratoDestino.descricao,
                valor: Number(mov.lancamentoExtratoDestino.valor),
                categoriaNome: mov.lancamentoExtratoDestino.categoria?.nome ?? null,
                bancoNome: mov.lancamentoExtratoDestino.banco.nome,
              }
            : null
        }
        candidatos={destinoCandidatos}
      />
    </div>
  );
}
