import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { TITULO_PAGINA } from "@/lib/estilo";
import { acertarDescontoCombustivelPago } from "../../actions";
import { FormularioDesconto } from "./formulario-desconto";

export const metadata = { title: "Combustíveis Pagos (acertar desconto)" };

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

function paraTexto(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export default async function AcertarDescontoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("COMBUSTIVEIS_A_PAGAR", "editar");
  const { id } = await params;
  const conta = await prisma.contaAPagar.findUnique({
    where: { id },
    include: { posto: true, fornecedor: true, lancamentosExtratoConciliados: { include: { banco: true }, orderBy: { data: "asc" } }, acertosEntrePostos: { include: { postoOrigem: true } } },
  });
  if (!conta || !conta.combustivel || !conta.paga) notFound();

  const pagoNoExtrato =
    conta.lancamentosExtratoConciliados.reduce((s, l) => s + Math.abs(Number(l.valor)), 0) + conta.acertosEntrePostos.reduce((s, m) => s + Number(m.valor), 0);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/combustiveis-pagos" className="text-sm text-foreground/60 underline">
          ← Voltar
        </Link>
        <h1 className={TITULO_PAGINA}>Acertar desconto — combustível pago</h1>
      </div>

      <div className="max-w-xl space-y-1 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
        <p>
          <strong>{conta.posto.nome}</strong> · {conta.fornecedor.nome}
        </p>
        <p className="text-foreground/70">
          Descarga {formatarData(conta.dataDescarga)} · Vencimento {formatarData(conta.dataVencimento)} · Pago em {formatarData(conta.dataPagamento)}
        </p>
        {conta.descricao && <p className="text-foreground/70">{conta.descricao}</p>}
        <p className="pt-1">
          Pago no extrato: <strong>{formatarMoeda(pagoNoExtrato)}</strong>
          {conta.lancamentosExtratoConciliados.length + conta.acertosEntrePostos.length > 0 && (
            <span className="text-foreground/60">
              {" "}
              ({[...conta.lancamentosExtratoConciliados.map((l) => `${formatarData(l.data)} ${formatarMoeda(Math.abs(Number(l.valor)))}`), ...conta.acertosEntrePostos.map((m) => `acerto ${m.postoOrigem.nome} ${formatarMoeda(Number(m.valor))}`)].join(" + ")})
            </span>
          )}
        </p>
      </div>

      <p className="max-w-xl text-sm text-foreground/60">
        Informe o valor cheio do boleto e o desconto. <strong>Valor menos desconto</strong> precisa fechar com o que foi pago no extrato. A baixa e o
        vínculo com o extrato não mudam, e o desconto entra na conciliação da Bonificação Postecipada (Ipiranga).
      </p>

      <FormularioDesconto
        valorInicial={paraTexto(Number(conta.valor))}
        descontoInicial={Number(conta.desconto) > 0 ? paraTexto(Number(conta.desconto)) : ""}
        action={acertarDescontoCombustivelPago.bind(null, id)}
      />
    </div>
  );
}
