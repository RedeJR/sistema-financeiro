import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { sugestaoPlanoContaPorFornecedor } from "@/lib/sugestao-plano-conta";
import { FormularioContaAPagar } from "../formulario-conta-a-pagar";
import { criarContaAPagar } from "../actions";

export default async function NovaContaAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ voltarPara?: string }>;
}) {
  await exigirPermissao("CONTAS_A_PAGAR", "editar");
  const { voltarPara } = await searchParams;

  const [postos, fornecedores, grupos, sugestaoPlanoConta] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.fornecedor.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.grupoPlanoConta.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      include: { contas: { where: { ativo: true }, orderBy: { nome: "asc" } } },
    }),
    sugestaoPlanoContaPorFornecedor(),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova conta a pagar</h2>
      {postos.length === 0 || fornecedores.length === 0 || grupos.length === 0 ? (
        <p className="text-sm text-foreground/60">
          Antes de cadastrar, é preciso ter pelo menos um Posto, um
          Fornecedor e uma conta no Plano de Contas cadastrados (em
          Cadastros).
        </p>
      ) : (
        <FormularioContaAPagar
          action={criarContaAPagar}
          postos={postos}
          fornecedores={fornecedores}
          grupos={grupos}
          sugestaoPlanoContaPorFornecedor={sugestaoPlanoConta}
          voltarPara={voltarPara}
          valoresIniciais={{
            postoId: "",
            fornecedorId: "",
            planoContaId: "",
            dataEmissao: hoje,
            dataVencimento: "",
            numeroDocumento: null,
            valor: "",
            descricao: null,
            observacao: null,
          }}
        />
      )}
    </div>
  );
}
