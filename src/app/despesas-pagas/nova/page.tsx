import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { sugestaoPlanoContaPorFornecedor } from "@/lib/sugestao-plano-conta";
import { FormularioDespesaAvulsa } from "../formulario-despesa-avulsa";

export default async function NovaDespesaAvulsaPage({
  searchParams,
}: {
  searchParams: Promise<{ voltarPara?: string }>;
}) {
  await exigirPermissao("DESPESAS_PAGAS", "editar");
  const { voltarPara } = await searchParams;

  const [postos, fornecedores, grupos, bancos, sugestaoPlanoConta] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" } } },
    }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    sugestaoPlanoContaPorFornecedor(),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova despesa avulsa</h2>
      <p className="text-sm text-foreground/60">
        Pra despesas que surgiram no dia, fora do que já estava planejado em
        Contas a Pagar — entra direto como paga.
      </p>
      {postos.length === 0 || fornecedores.length === 0 || grupos.length === 0 || bancos.length === 0 ? (
        <p className="text-sm text-foreground/60">
          Antes de cadastrar, é preciso ter pelo menos um Posto, um
          Fornecedor, um Banco e uma conta no Plano de Contas cadastrados (em
          Cadastros).
        </p>
      ) : (
        <FormularioDespesaAvulsa
          postos={postos}
          fornecedores={fornecedores}
          grupos={grupos}
          bancos={bancos}
          sugestaoPlanoContaPorFornecedor={sugestaoPlanoConta}
          voltarPara={voltarPara}
        />
      )}
    </div>
  );
}
