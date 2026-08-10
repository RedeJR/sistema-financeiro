import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { formatarCpf } from "@/lib/cpf";
import { FormularioUsuario } from "../../formulario-usuario";
import { atualizarUsuario } from "../../actions";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await exigirPermissao("USUARIOS", "editar");

  const { id } = await params;
  const usuario = await prisma.usuario.findUnique({
    where: { id },
    include: { permissoes: true },
  });
  if (!usuario) notFound();

  const acaoComId = atualizarUsuario.bind(null, id);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Editar usuário</h2>
      <FormularioUsuario
        action={acaoComId}
        modoEdicao
        valoresIniciais={{
          nome: usuario.nome,
          cpf: formatarCpf(usuario.cpf),
          email: usuario.email,
          permissoes: usuario.permissoes,
        }}
      />
    </div>
  );
}
