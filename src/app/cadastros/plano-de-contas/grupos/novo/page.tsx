import { exigirPermissao } from "@/lib/auth";
import { FormularioGrupo } from "../../formulario-grupo";
import { criarGrupoPlanoConta } from "../../actions";

export default async function NovoGrupoPage() {
  await exigirPermissao("CADASTROS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Novo grupo</h2>
      <FormularioGrupo action={criarGrupoPlanoConta} />
    </div>
  );
}
