import Link from "next/link";

const CARDS = [
  {
    href: "/cadastros/postos",
    titulo: "Postos",
    descricao: "Os postos/unidades que usam o sistema.",
  },
  {
    href: "/cadastros/fornecedores",
    titulo: "Fornecedores",
    descricao: "Quem recebe pagamento nas Contas a Pagar.",
  },
  {
    href: "/cadastros/bancos",
    titulo: "Bancos",
    descricao: "Bancos usados na conciliação de extratos.",
  },
  {
    href: "/cadastros/categorias-extrato",
    titulo: "Categorias de Extrato",
    descricao: "Classificação das linhas de extrato no fechamento (Cielo, PIX, tarifas...).",
  },
  {
    href: "/cadastros/plano-de-contas",
    titulo: "Plano de Contas",
    descricao: "Plano de contas contábil (Grupo → Conta) usado nas Contas a Pagar.",
  },
];

export default function CadastrosHome() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CARDS.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-lg border border-black/10 p-4 hover:border-black/25 dark:border-white/15 dark:hover:border-white/30"
        >
          <h2 className="font-medium">{c.titulo}</h2>
          <p className="mt-1 text-sm text-foreground/60">{c.descricao}</p>
        </Link>
      ))}
    </div>
  );
}
