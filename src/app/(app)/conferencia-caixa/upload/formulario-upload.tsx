"use client";

import { useRef, useState } from "react";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import type { ResultadoArquivoCartao } from "@/lib/cartoes/importar";
import { importarParteCartaoAction } from "./actions";

type Opcao = { id: string; nome: string };

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  ok: { texto: "importado", classe: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" },
  erro: { texto: "erro", classe: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400" },
};

export function FormularioUpload({ postos }: { postos: Opcao[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [resultados, setResultados] = useState<ResultadoArquivoCartao[] | null>(null);

  // Um arquivo por vez, cada um em partes (ver importarParteCartaoAction):
  // nenhuma chamada fica perto do limite de tempo da função, mesmo com arquivo
  // multi-posto grande (Stone), e se uma parte falhar as anteriores já estão
  // gravadas — reenviar o mesmo arquivo só grava o que faltou.
  async function importar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const postoId = String(new FormData(form).get("postoId") ?? "");
    const arquivos = Array.from((form.elements.namedItem("arquivos") as HTMLInputElement).files ?? []);
    if (!postoId) return setErro("Escolha um posto.");
    if (arquivos.length === 0) return setErro("Escolha ao menos um arquivo.");

    setErro(undefined);
    setResultados(null);
    setProcessando(true);
    const finais: ResultadoArquivoCartao[] = [];

    for (const arquivo of arquivos) {
      const acumulado: ResultadoArquivoCartao = { arquivo: arquivo.name, status: "ok", gravados: 0, duplicados: 0, atualizados: 0 };
      let deslocamento = 0;
      for (;;) {
        setProgresso(`${arquivo.name}${deslocamento > 0 ? ` — a partir da venda ${deslocamento}` : ""}...`);
        const dados = new FormData();
        dados.set("postoId", postoId);
        dados.set("arquivo", arquivo);
        dados.set("deslocamento", String(deslocamento));
        let parte;
        try {
          parte = await importarParteCartaoAction(dados);
        } catch {
          acumulado.status = "erro";
          acumulado.mensagem = `Falhou ao gravar a partir da venda ${deslocamento}. O que veio antes já foi gravado — é só enviar o mesmo arquivo de novo (não duplica).`;
          break;
        }
        if ("erro" in parte) {
          acumulado.status = "erro";
          acumulado.mensagem = parte.erro;
          break;
        }
        const r = parte.resultado;
        acumulado.adquirente = r.adquirente ?? acumulado.adquirente;
        if (r.status === "erro") {
          acumulado.status = "erro";
          acumulado.mensagem = r.mensagem;
          break;
        }
        acumulado.gravados = (acumulado.gravados ?? 0) + (r.gravados ?? 0);
        acumulado.duplicados = (acumulado.duplicados ?? 0) + (r.duplicados ?? 0);
        acumulado.atualizados = (acumulado.atualizados ?? 0) + (r.atualizados ?? 0);
        if (r.mensagem) acumulado.mensagem = r.mensagem;
        if (parte.proximo === null) break;
        deslocamento = parte.proximo;
      }
      finais.push(acumulado);
      setResultados([...finais]);
    }

    setProgresso("");
    setProcessando(false);
    formRef.current?.reset();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <form ref={formRef} onSubmit={importar} className="space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-sm font-medium text-foreground/80">
            Posto
          </label>
          <select id="postoId" name="postoId" defaultValue="" className={campoSelect} required>
            <option value="" disabled>
              Escolha um posto
            </option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <p className="text-xs text-foreground/50">
            Pra arquivos que já trazem todos os postos juntos (ex: Stone), não importa qual posto você
            escolher aqui — cada venda vai pro posto certo sozinha.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="arquivos" className="text-sm font-medium text-foreground/80">
            Arquivo(s) das adquirentes
          </label>
          <input
            id="arquivos"
            name="arquivos"
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            required
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foreground file:px-3 file:py-1.5 file:text-background dark:border-white/20"
          />
          <p className="text-xs text-foreground/50">
            Pode selecionar vários arquivos de uma vez, de adquirentes diferentes — o sistema tenta
            reconhecer qual é qual pelo nome do arquivo (ajuda ter o nome da adquirente nele, ex:
            BARRAMARES_CIELO.csv) e, se não achar nada, olha as colunas do próprio arquivo. Adquirentes
            cobertas por enquanto: Cielo, Stone, Rede, Getnet, Pagseguro, SAQPAY, Sem Parar, Abastece Aí e
            Premmia — Tecban, VR e Shipay ainda não.
          </p>
        </div>

        <ErroFormulario mensagem={erro} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={processando}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            {processando ? "Importando..." : "Importar"}
          </button>
          {progresso && <span className="text-sm text-foreground/60">{progresso}</span>}
        </div>
      </form>

      {resultados && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="text-sm font-medium">Resultado da importação</h2>
          <ul className="space-y-2 text-sm">
            {resultados.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs ${ROTULO_STATUS[r.status].classe}`}>
                  {ROTULO_STATUS[r.status].texto}
                </span>
                <span className="font-medium">{r.arquivo}</span>
                {r.adquirente && <span className="text-foreground/50">({r.adquirente})</span>}
                {r.status === "ok" && (
                  <span className="text-foreground/60">
                    {r.gravados} transaç{r.gravados === 1 ? "ão" : "ões"} gravada{r.gravados === 1 ? "" : "s"}
                    {r.duplicados ? ` · ${r.duplicados} já existia${r.duplicados === 1 ? "" : "m"}` : ""}
                    {r.atualizados ? ` · ${r.atualizados} com valor líquido preenchido` : ""}
                  </span>
                )}
                {r.mensagem && <span className="text-foreground/60">{r.mensagem}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
