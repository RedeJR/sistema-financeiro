import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { sugestaoPlanoContaPorFornecedor } from "@/lib/sugestao-plano-conta";
import { bancoPadraoPorPosto } from "@/lib/banco-padrao-posto";
import { FormularioDespesaAvulsa } from "../../formulario-despesa-avulsa";
import { atualizarDespesaPaga } from "../../actions";

export const metadata = { title: "Despesas Pagas (editar)" };

export default async function EditarDespesaPagaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ voltarPara?: string }>;
}) {
  await exigirPermissao("DESPESAS_PAGAS", "editar");
  const { id } = await params;
  const { voltarPara } = await searchParams;

  const [conta, postos, fornecedores, grupos, bancos, sugestaoPlanoConta] = await Promise.all([
    prisma.contaAPagar.findUnique({ where: { id } }),
    // Todos (não só ativos) pra não perder a referência de algo desativado depois.
    prisma.posto.findMany({ orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { orderBy: { nome: "asc" } } },
    }),
    prisma.banco.findMany({ orderBy: { nome: "asc" } }),
    sugestaoPlanoContaPorFornecedor(),
  ]);
  if (!conta) notFound();

  if (!conta.paga) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Editar despesa paga</h2>
        <p className="text-sm text-foreground/60">Essa despesa não está paga — edite em Contas a Pagar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar despesa paga</h2>
      <p className="text-sm text-foreground/60">
        Se mudar valor, data, banco ou posto que pagou, o vínculo com o lançamento do extrato é desfeito e a conciliação
        religa sozinha na próxima rodada.
      </p>
      <FormularioDespesaAvulsa
        action={atualizarDespesaPaga.bind(null, id)}
        postos={postos}
        fornecedores={fornecedores}
        grupos={grupos}
        bancos={bancos}
        sugestaoPlanoContaPorFornecedor={sugestaoPlanoConta}
        bancoPadraoPorPosto={bancoPadraoPorPosto(postos, bancos)}
        voltarPara={voltarPara}
        valoresIniciais={{
          postoId: conta.postoId,
          fornecedorId: conta.fornecedorId,
          planoContaId: conta.planoContaId,
          bancoId: conta.bancoPagamentoId ?? "",
          dataPagamento: (conta.dataPagamento ?? conta.dataVencimento).toISOString().slice(0, 10),
          postoPagamentoId: conta.postoPagamentoId ?? "",
          numeroDocumento: conta.numeroDocumento ?? "",
          descricao: conta.descricao ?? "",
          valor: Number(conta.valor).toFixed(2).replace(".", ","),
        }}
      />
    </div>
  );
}
