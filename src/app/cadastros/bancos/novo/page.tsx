import { exigirPermissao } from "@/lib/auth";
import { FormularioBanco } from "../formulario-banco";
import { criarBanco } from "../actions";

export default async function NovoBancoPage() {
  await exigirPermissao("CADASTROS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Novo banco</h2>
      <FormularioBanco action={criarBanco} />
    </div>
  );
}
