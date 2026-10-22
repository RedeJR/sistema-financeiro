// Botão "Ver descrição" + linha que abre logo abaixo da conta. É só HTML/CSS
// (checkbox escondido + regras em globals.css), então serve em tabela (<tr>) e
// em grade (<div>) sem virar componente de cliente. Uso:
//   <tr className="item-desc"> ... <BotaoVerDescricao id={c.id} /> ... </tr>
//   <LinhaDescricao colSpan={8} texto={c.descricao} />   // logo após o <tr>
// Sem descrição, nada é desenhado.
export function BotaoVerDescricao({ id, descricao }: { id: string; descricao: string | null }) {
  if (!descricao?.trim()) return null;
  return (
    <>
      <input type="checkbox" id={`desc-${id}`} className="toggle-desc sr-only" />
      <label
        htmlFor={`desc-${id}`}
        className="cursor-pointer rounded-md border border-black/15 px-2 py-1 text-xs whitespace-nowrap text-foreground/70 hover:bg-black/5 print:hidden dark:border-white/20 dark:hover:bg-white/10"
      >
        <span className="rotulo-ver">Ver descrição</span>
        <span className="rotulo-ocultar">Ocultar descrição</span>
      </label>
    </>
  );
}

export function LinhaDescricao({ colSpan, texto }: { colSpan: number; texto: string | null }) {
  if (!texto?.trim()) return null;
  return (
    <tr className="linha-desc bg-black/[0.03] dark:bg-white/[0.04]">
      <td colSpan={colSpan} className="px-4 py-2 text-sm whitespace-pre-wrap text-foreground/80">
        <span className="text-foreground/50">Descrição: </span>
        {texto}
      </td>
    </tr>
  );
}

export function BlocoDescricao({ texto }: { texto: string | null }) {
  if (!texto?.trim()) return null;
  return (
    <div className="linha-desc-bloco bg-black/[0.03] px-4 py-2 text-sm whitespace-pre-wrap text-foreground/80 dark:bg-white/[0.04]">
      <span className="text-foreground/50">Descrição: </span>
      {texto}
    </div>
  );
}
