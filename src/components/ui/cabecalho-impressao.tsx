import { usuarioAtual } from "@/lib/auth";
import { TituloArquivo } from "@/components/ui/titulo-arquivo";

// Cabeçalho padrão de todo relatório impresso / salvo em PDF (só aparece na impressão):
// marca do sistema, título do relatório, filtros aplicados e quem emitiu, com data e hora
// (horário de Brasília). O rodapé com "Página N de M" vem do @page em globals.css.
// Uso: <CabecalhoImpressao titulo="Conciliação de Cartões" detalhes={[{ rotulo: "Posto", valor: "BARRAMARES" }]} />
export async function CabecalhoImpressao({
  titulo,
  detalhes = [],
}: {
  titulo: string;
  detalhes?: { rotulo: string; valor: string | null | undefined }[];
}) {
  const usuario = await usuarioAtual();
  const agora = new Date();
  const data = agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const nome = usuario?.nome?.split(" ")[0];
  // Nome sugerido pro arquivo ao salvar em PDF: título + filtros, sem caracteres que o Windows não aceita.
  const nomeArquivo = [titulo, ...detalhes.map((d) => d.valor).filter(Boolean)]
    .join(" - ")
    .replace(/[\/:*?"<>|]+/g, "-")
    .replace(/s+/g, " ")
    .slice(0, 120);

  return (
    <header className="hidden items-start justify-between gap-6 border-b-2 border-blue-700 pb-3 print:flex">
      <TituloArquivo nome={nomeArquivo} />
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-base font-bold text-white">JR</span>
        <div>
          <p className="text-[8px] font-semibold tracking-wider text-gray-500 uppercase">Sistema Financeiro</p>
          <h1 className="mt-0.5 text-[19px] leading-tight font-bold tracking-tight text-gray-900">{titulo}</h1>
        </div>
      </div>
      <div className="text-right text-[9px] leading-relaxed text-gray-500">
        {detalhes
          .filter((d) => d.valor)
          .map((d) => (
            <p key={d.rotulo}>
              <strong className="font-semibold text-gray-900">{d.rotulo}:</strong> {d.valor}
            </p>
          ))}
        <p>
          <strong className="font-semibold text-gray-900">Emitido em:</strong> {data} às {hora}
          {nome ? ` · por ${nome}` : ""}
        </p>
      </div>
    </header>
  );
}
