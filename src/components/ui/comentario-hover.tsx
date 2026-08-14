// Ícone de comentário estilo Excel: passa o mouse em cima e aparece o texto
// completo, sem precisar de clique nem de estado (puro CSS via group-hover)
// — funciona direto em Server Component, sem precisar virar "use client".
// Usado pra mostrar a Observação de uma Conta a Pagar (dados bancários,
// desconto/acréscimo combinado etc.) sem misturar com a Descrição na
// listagem.
export function ComentarioHover({ texto }: { texto: string }) {
  return (
    <span className="group relative inline-block cursor-help align-middle" tabIndex={0}>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold leading-none text-amber-900 dark:bg-amber-900/60 dark:text-amber-300">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-64 -translate-x-1/2 whitespace-pre-line rounded-md border border-black/10 bg-background p-2 text-left text-xs font-normal text-foreground shadow-lg group-hover:block group-focus:block dark:border-white/15">
        {texto}
      </span>
    </span>
  );
}
