import { exigirPermissao } from "@/lib/auth";
import { FormularioCategoriaExtrato } from "../formulario-categoria-extrato";
import { criarCategoriaExtrato } from "../actions";

export default async function NovaCategoriaExtratoPage() {
  await exigirPermissao("CADASTROS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova categoria</h2>
      <FormularioCategoriaExtrato action={criarCategoriaExtrato} />
    </div>
  );
}
