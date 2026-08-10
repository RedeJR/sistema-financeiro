import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioContaAPagar } from "../../formulario-conta-a-pagar";
import { atualizarContaAPagar } from "../../actions";

function paraDataInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function EditarContaAPagarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("CONTAS_A_PAGAR", "editar");

  const { id } = await params;
  const [conta, postos, fornecedores, grupos] = await Promise.all([
    prisma.contaAPagar.findUnique({ where: { id } }),
    // Busca todos (não só ativos) pra não perder a referência se algo foi
    // desativado depois que essa conta foi criada.
    prisma.posto.findMany({ orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { orderBy: { nome: "asc" } } },
    }),
  ]);
  if (!conta) notFound();

  if (conta.paga) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Editar conta a pagar</h2>
        <p className="text-sm text-foreground/60">
          Essa conta já foi paga — não dá mais pra editar por aqui. Pra
          corrigir algo, desfaça o pagamento na tela de Despesas Pagas.
        </p>
      </div>
    );
  }

  const acaoComId = atualizarContaAPagar.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">
        Editar conta a pagar
        {conta.totalParcelas ? ` — parcela ${conta.numeroParcela}/${conta.totalParcelas}` : ""}
        {conta.recorrente ? " — recorrente" : ""}
      </h2>
      <FormularioContaAPagar
        action={acaoComId}
        modoEdicao
        postos={postos}
        fornecedores={fornecedores}
        grupos={grupos}
        valoresIniciais={{
          postoId: conta.postoId,
          fornecedorId: conta.fornecedorId,
          planoContaId: conta.planoContaId,
          dataEmissao: paraDataInput(conta.dataEmissao),
          dataVencimento: paraDataInput(conta.dataVencimento),
          numeroDocumento: conta.numeroDocumento,
          valor: conta.valor.toString(),
          descricao: conta.descricao,
        }}
      />
    </div>
  );
}
