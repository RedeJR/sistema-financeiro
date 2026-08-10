export function ErroFormulario({ mensagem }: { mensagem?: string | null }) {
  if (!mensagem) return null;
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
      {mensagem}
    </p>
  );
}
