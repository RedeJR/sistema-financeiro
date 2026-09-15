import { exigirPermissao } from "@/lib/auth";
import { FormularioUsuario } from "../formulario-usuario";
import { criarUsuario } from "../actions";

export default async function NovoUsuarioPage() {
  await exigirPermissao("USUARIOS", "editar");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Novo usuário</h2>
      <FormularioUsuario action={criarUsuario} />
    </div>
  );
}
