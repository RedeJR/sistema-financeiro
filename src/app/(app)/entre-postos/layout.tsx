import { exigirPermissao } from "@/lib/auth";
import { AbasNav } from "../cartoes/abas-nav";

const ABAS = [
  { href: "/entre-postos", label: "Movimentações" },
  { href: "/entre-postos/relacao-devedores", label: "Relação de Devedores" },
];

export default async function EntrePostosLayout({ children }: { children: React.ReactNode }) {
  await exigirPermissao("ENTRE_POSTOS", "visualizar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Entre Postos</h1>
        <AbasNav abas={ABAS} />
      </div>
      {children}
    </div>
  );
}
