"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { useFormKey } from "@/hooks/use-form-key";
import { importarTransacoesCartaoAction, type ImportarCartaoState } from "./actions";

type Opcao = { id: string; nome: string };

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
  ok: { texto: "importado", classe: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" },
  erro: { texto: "erro", classe: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400" },
};

export function FormularioUpload({ postos }: { postos: Opcao[] }) {
  const [state, formAction] = useActionState<ImportarCartaoState, FormData>(importarTransacoesCartaoAction, null);
  const formKey = useFormKey(state);

  return (
    <div className="max-w-2xl space-y-6">
      <form key={formKey} action={formAction} className="space-y-4">
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
            Pode selecionar vários arquivos de uma vez, de adquirentes diferentes — o sistema reconhece
            qual é qual pelo nome do arquivo (precisa ter o nome da adquirente nele, ex: BARRAMARES_CIELO.csv).
            Adquirentes cobertas por enquanto: Cielo, Stone, Rede, Getnet e Pagseguro.
          </p>
        </div>

        <ErroFormulario mensagem={state?.erro} />
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Importando...">Importar</SubmitButton>
        </div>
      </form>

      {state?.resultados && (
        <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="text-sm font-medium">Resultado da importação</h2>
          <ul className="space-y-2 text-sm">
            {state.resultados.map((r, i) => (
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
