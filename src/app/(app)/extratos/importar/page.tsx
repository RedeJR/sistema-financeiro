import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth";
import { FormularioImportar } from "./formulario-importar";

export default async function ImportarExtratoPage() {
  await exigirPermissao("EXTRATOS", "editar");

  const [postos, bancos] = await Promise.all([
    prisma.posto.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
    prisma.banco.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Importar extrato</h2>
      <p className="text-sm text-foreground/60">
        Escolha o posto e o banco, e envie o(s) arquivo(s) do extrato — o sistema já sugere a categoria
        de cada lançamento automaticamente, e você revisa depois em Conciliação de Extratos. Lançamentos
        repetidos (mesmo dia, descrição e valor) não duplicam se o mesmo extrato for enviado de novo.
      </p>
      <FormularioImportar postos={postos} bancos={bancos} />
    </div>
  );
}
