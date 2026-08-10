import { exigirPermissao } from "@/lib/auth";
import { FormularioPosto } from "../formulario-posto";
import { criarPosto } from "../actions";

export default async function NovoPostoPage() {
  await exigirPermissao("CADASTROS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Novo posto</h2>
      <FormularioPosto action={criarPosto} />
    </div>
  );
}
