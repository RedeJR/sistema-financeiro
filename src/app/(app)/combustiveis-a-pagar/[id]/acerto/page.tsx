import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { hojeISOBrasil } from "@/lib/datas-padrao";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { TITULO_PAGINA } from "@/lib/estilo";
import { desfazerAcertoEntrePostos, registrarAcertoEntrePostos } from "./actions";
import { FormularioAcerto } from "./formulario-acerto";

export const metadata = { title: "Combustíveis a Pagar (acerto entre postos)" };

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export default async function AcertoEntrePostosPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const { id } = await params;
  const [conta, postos] = await Promise.all([
    prisma.contaAPagar.findUnique({
      where: { id },
      include: {
        posto: true,
        fornecedor: true,
        lancamentosExtratoConciliados: { include: { banco: true }, orderBy: { data: "asc" } },
        acertosEntrePostos: { include: { postoOrigem: true }, orderBy: { data: "asc" } },
      },
    }),
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  if (!conta || !conta.combustivel) notFound();

  const liquido = Number(conta.valor) - Number(conta.desconto);
  const pagoExtrato = conta.lancamentosExtratoConciliados.reduce((s, l) => s + Math.abs(Number(l.valor)), 0);
  const pagoAcertos = conta.acertosEntrePostos.reduce((s, m) => s + Number(m.valor), 0);
  const restante = Math.max(0, Math.round((liquido - pagoExtrato - pagoAcertos) * 100) / 100);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/combustiveis-a-pagar" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className={TITULO_PAGINA}>Acerto entre postos</h1>
      </div>

      <div className="max-w-xl space-y-1 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <p>
          <strong>{conta.posto.nome}</strong> · {conta.fornecedor.nome}
        </p>
        <p className="text-foreground/70">
          Vencimento {formatarData(conta.dataVencimento)}
          {conta.descricao ? ` · ${conta.descricao}` : ""}
        </p>
        <p className="pt-1">
          Boleto: <strong>{formatarMoeda(liquido)}</strong>
          {Number(conta.desconto) > 0 && <span className="text-foreground/60"> (já com desconto de {formatarMoeda(Number(conta.desconto))})</span>}
        </p>
        <p>
          Pago no extrato: <strong>{formatarMoeda(pagoExtrato)}</strong> · Acertos entre postos: <strong>{formatarMoeda(pagoAcertos)}</strong> · Falta:{" "}
          <strong>{formatarMoeda(restante)}</strong>
        </p>
      </div>

      {conta.acertosEntrePostos.length > 0 && (
        <div className="max-w-xl space-y-2">
          <h2 className="text-sm font-semibold">Acertos já registrados</h2>
          {conta.acertosEntrePostos.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15">
              <span>
                {formatarData(m.data)} — <strong>{m.postoOrigem.nome}</strong> quitou {formatarMoeda(Number(m.valor))} (devolução para {conta.posto.nome})
              </span>
              <form action={desfazerAcertoEntrePostos}>
                <input type="hidden" name="movimentacaoId" value={m.id} />
                <ConfirmSubmitButton confirmMessage="Desfazer esse acerto? A devolução some do Entre Postos e a conta volta a ficar em aberto se faltar valor.">
                  Desfazer
                </ConfirmSubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}

      {restante > 0 ? (
        <>
          <p className="max-w-xl text-sm text-foreground/60">
            Use quando o boleto foi quitado por fora do extrato (por exemplo, um terceiro pagou e isso abateu a dívida de um posto com o dono
            do boleto). O sistema registra uma <strong>devolução</strong> no Entre Postos, do posto que quitou para <strong>{conta.posto.nome}</strong>, e dá o
            boleto como pago quando extrato + acertos fecham o valor.
          </p>
          <FormularioAcerto
            postos={postos.filter((p) => p.id !== conta.postoId)}
            restante={restante.toFixed(2).replace(".", ",")}
            hoje={hojeISOBrasil()}
            action={registrarAcertoEntrePostos.bind(null, id)}
          />
        </>
      ) : (
        <p className="text-sm text-foreground/60">Esse boleto já está totalmente pago (extrato + acertos).</p>
      )}
    </div>
  );
}
