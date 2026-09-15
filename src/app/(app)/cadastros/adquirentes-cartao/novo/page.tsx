import { exigirPermissao } from "@/lib/auth";
import { FormularioAdquirente } from "../formulario-adquirente";
import { criarAdquirenteCartao } from "../actions";

export default async function NovoAdquirenteCartaoPage() {
  await exigirPermissao("CADASTROS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Nova adquirente</h2>
      <FormularioAdquirente action={criarAdquirenteCartao} />
    </div>
  );
}
