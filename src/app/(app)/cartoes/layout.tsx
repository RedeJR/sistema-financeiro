import { exigirPermissao } from "@/lib/auth";
import { AbasNav } from "./abas-nav";

const ABAS = [
  { href: "/cartoes/conferencia-taxas", label: "Taxas" },
  { href: "/cartoes/conciliacao", label: "Recebimentos" },
  { href: "/cartoes/fechamento", label: "Fechamento" },
];

export default async function CartoesLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("CARTOES", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cartões</h1>
        <AbasNav abas={ABAS} />
      </div>
      {children}
    </div>
  );
}
