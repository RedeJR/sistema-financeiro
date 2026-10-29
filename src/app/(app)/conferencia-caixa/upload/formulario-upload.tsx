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

// A hospedagem recusa requisição acima de 4,5 MB, e cada parte da importação manda o arquivo
// inteiro. CSV maior que isso (ex: Stone com o mês todo, ~5,5 MB) é cortado aqui em pedaços de até
// 3 MB, cada um com o cabeçalho, e cada pedaço é importado em sequência. Corta só em quebra de
// linha (byte 0x0A, igual em UTF-8 e Windows-1252) — nunca no meio de uma venda.
const TAMANHO_MAXIMO_PARTE = 3 * 1024 * 1024;
const LIMITE_SEM_CORTAR = 4 * 1024 * 1024;

async function dividirSeGrande(arquivo: File): Promise<File[] | { erro: string }> {
  if (arquivo.size <= LIMITE_SEM_CORTAR) return [arquivo];
  if (!/.(csv|txt)$/i.test(arquivo.name)) {
    return { erro: `${arquivo.name} tem ${(arquivo.size / 1048576).toFixed(1)} MB, acima do limite de 4 MB por arquivo, e esse formato não pode ser dividido. Baixe um período menor da adquirente e envie de novo.` };
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const fimCabecalho = bytes.indexOf(10) + 1;
  if (fimCabecalho <= 0) return { erro: `Não consegui ler o cabeçalho de ${arquivo.name}.` };
  const cabecalho = bytes.subarray(0, fimCabecalho);
  const limite = TAMANHO_MAXIMO_PARTE - cabecalho.length;
  const partes: File[] = [];
  let inicio = fimCabecalho;
  while (inicio < bytes.length) {
    let fim = Math.min(inicio + limite, bytes.length);
    if (fim < bytes.length) {
      const quebra = bytes.lastIndexOf(10, fim - 1);
      if (quebra < inicio) return { erro: `${arquivo.name} tem uma linha grande demais para dividir.` };
      fim = quebra + 1;
    }
    partes.push(new File([cabecalho, bytes.subarray(inicio, fim)], arquivo.name, { type: arquivo.type }));
    inicio = fim;
  }
  return partes;
}

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
      const partes = await dividirSeGrande(arquivo);
      if ("erro" in partes) {
        acumulado.status = "erro";
        acumulado.mensagem = partes.erro;
        finais.push(acumulado);
        setResultados([...finais]);
        continue;
      }
      parte: for (const [numeroParte, pedaco] of partes.entries()) {
        const rotuloParte = partes.length > 1 ? ` (parte ${numeroParte + 1} de ${partes.length})` : "";
        let deslocamento = 0;
        for (;;) {
          setProgresso(`${arquivo.name}${rotuloParte}${deslocamento > 0 ? ` — a partir da venda ${deslocamento}` : ""}...`);
          const dados = new FormData();
          dados.set("postoId", postoId);
          dados.set("arquivo", pedaco);
          dados.set("deslocamento", String(deslocamento));
          let resposta;
          try {
            resposta = await importarParteCartaoAction(dados);
          } catch {
            acumulado.status = "erro";
            acumulado.mensagem = `Falhou ao gravar${rotuloParte} a partir da venda ${deslocamento}. O que veio antes já foi gravado — é só enviar o mesmo arquivo de novo (não duplica).`;
            break parte;
          }
          if ("erro" in resposta) {
            acumulado.status = "erro";
            acumulado.mensagem = resposta.erro;
            break parte;
          }
          const r = resposta.resultado;
          acumulado.adquirente = r.adquirente ?? acumulado.adquirente;
          if (r.status === "erro") {
            acumulado.status = "erro";
            acumulado.mensagem = r.mensagem;
            break parte;
          }
          acumulado.gravados = (acumulado.gravados ?? 0) + (r.gravados ?? 0);
          acumulado.duplicados = (acumulado.duplicados ?? 0) + (r.duplicados ?? 0);
          acumulado.atualizados = (acumulado.atualizados ?? 0) + (r.atualizados ?? 0);
          if (r.mensagem) acumulado.mensagem = r.mensagem;
          if (resposta.proximo === null) break;
          deslocamento = resposta.proximo;
        }
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
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-3 file:py-1.5 file:text-white dark:border-white/20"
          />
          <p className="text-xs text-foreground/50">
            Pode selecionar vários arquivos de uma vez, de adquirentes diferentes — o sistema tenta
            reconhecer qual é qual pelo nome do arquivo (ajuda ter o nome da adquirente nele, ex:
            BARRAMARES_CIELO.csv) e, se não achar nada, olha as colunas do próprio arquivo. Adquirentes
            cobertas por enquanto: Cielo, Stone, Rede, Getnet, Pagseguro, SAQPAY, Sem Parar, Abastece Aí, Baratão e
            Premmia — Tecban, VR e Shipay ainda não.
          </p>
        </div>

        <ErroFormulario mensagem={erro} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={processando}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
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
