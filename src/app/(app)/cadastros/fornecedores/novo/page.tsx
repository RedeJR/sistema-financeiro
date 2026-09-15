import { exigirPermissao } from "@/lib/auth";
import { FormularioFornecedor } from "../formulario-fornecedor";
import { criarFornecedor } from "../actions";

export default async function NovoFornecedorPage() {
  await exigirPermissao("CADASTROS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Novo fornecedor</h2>
      <FormularioFornecedor action={criarFornecedor} />
    </div>
  );
}
