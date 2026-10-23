// Aviso curto quando a lista abriu só com o dia padrão (ontem ou hoje) — pra ninguém achar que o resto sumiu.
export function AvisoPadraoDia({ modo, dia }: { modo: "hoje" | "ontem"; dia: string }) {
  const [a, m, d] = dia.split("-");
  return (
    <p className="rounded-xl border border-blue-200 bg-[#EEF4FF] px-5 py-2.5 text-[13px] text-blue-950 print:hidden dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      Mostrando só <strong className="font-semibold">{modo === "hoje" ? "hoje" : "ontem"}</strong> ({d}/{m}/{a}). Mude as datas pra ver outros dias, ou
      esvazie as duas e filtre pra ver tudo.
    </p>
  );
}
