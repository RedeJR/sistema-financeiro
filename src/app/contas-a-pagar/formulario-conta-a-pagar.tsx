"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Campo } from "@/components/ui/campo";
import { ErroFormulario } from "@/components/ui/erro-formulario";
import { SubmitButton } from "@/components/ui/submit-button";
import { SeletorPlanoConta } from "@/components/ui/seletor-plano-conta";
import { useFormKey } from "@/hooks/use-form-key";
import { adicionarMeses } from "@/lib/datas";
import { criarFornecedorRapido } from "./actions";
import type { ActionState } from "@/lib/form-state";

type Opcao = { id: string; nome: string };
type ContaComCodigo = { id: string; nome: string; codigo: string | null };
type GrupoComContas = { id: string; nome: string; contas: ContaComCodigo[] };
type Parcela = { vencimento: string; valor: string };

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  postos: Opcao[];
  fornecedores: Opcao[];
  grupos: GrupoComContas[];
  // fornecedorId -> planoContaId mais usado historicamente por ele (ver
  // src/lib/sugestao-plano-conta.ts) — só some ao trocar de fornecedor num
  // lançamento NOVO (não mexe durante edição), e continua editável depois.
  sugestaoPlanoContaPorFornecedor?: Record<string, string>;
  modoEdicao?: boolean;
  valoresIniciais?: {
    postoId: string;
    fornecedorId: string;
    planoContaId: string;
    dataEmissao: string;
    dataVencimento: string;
    numeroDocumento: string | null;
    valor: string;
    descricao: string | null;
    observacao: string | null;
  };
};

const campoSelect =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20";

function paraDataInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function FormularioContaAPagar({
  action,
  postos,
  fornecedores: fornecedoresIniciais,
  grupos,
  sugestaoPlanoContaPorFornecedor = {},
  modoEdicao = false,
  valoresIniciais,
}: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const formKey = useFormKey(state);
  const v = state?.values ?? valoresIniciais;

  // Fornecedor: lista local + cadastro rápido sem sair da tela.
  const [fornecedores, setFornecedores] = useState(fornecedoresIniciais);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState(v?.fornecedorId ?? "");
  // Sugestão de plano de contas ao trocar de fornecedor — só em lançamento
  // novo (ver comentário no tipo Props). undefined = "sem sugestão pra esse
  // fornecedor" ou "ainda não mexeu no campo", os dois tratados igual: não
  // força nada, deixa o valor atual do SeletorPlanoConta como está.
  const [planoContaSugerido, setPlanoContaSugerido] = useState<string | undefined>(undefined);

  function aoMudarFornecedor(novoFornecedorId: string) {
    setFornecedorSelecionado(novoFornecedorId);
    // Só atualiza (e força remontar o SeletorPlanoConta) quando existe
    // sugestão de verdade pro fornecedor novo — fornecedor sem histórico
    // não mexe no que já estava selecionado, nem limpa nada.
    const sugestao = sugestaoPlanoContaPorFornecedor[novoFornecedorId];
    if (!modoEdicao && sugestao) setPlanoContaSugerido(sugestao);
  }
  const [mostrarNovoFornecedor, setMostrarNovoFornecedor] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoDocumento, setNovoDocumento] = useState("");
  const [erroFornecedor, setErroFornecedor] = useState<string | null>(null);
  const [criandoFornecedor, startTransition] = useTransition();

  function handleCriarFornecedor() {
    setErroFornecedor(null);
    startTransition(async () => {
      const resultado = await criarFornecedorRapido(novoNome, novoDocumento || null);
      if ("error" in resultado) {
        setErroFornecedor(resultado.error);
        return;
      }
      setFornecedores((atual) => [...atual, resultado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setFornecedorSelecionado(resultado.id);
      setMostrarNovoFornecedor(false);
      setNovoNome("");
      setNovoDocumento("");
    });
  }

  // Parcelamento / recorrência (só no lançamento, não na edição de uma linha
  // já existente).
  const [recorrente, setRecorrente] = useState(false);
  const [numeroParcelas, setNumeroParcelas] = useState(1);
  const [vencimentoSeed, setVencimentoSeed] = useState(v?.dataVencimento ?? "");
  const [valorSeed, setValorSeed] = useState(v?.valor ?? "");
  const [parcelas, setParcelas] = useState<Parcela[]>([]);

  function regenerarParcelas(n: number) {
    if (!vencimentoSeed) return;
    const base = new Date(`${vencimentoSeed}T00:00:00.000Z`);
    setParcelas((atual) =>
      Array.from({ length: n }, (_, i) => atual[i] ?? { vencimento: paraDataInput(adicionarMeses(base, i)), valor: valorSeed })
    );
  }

  // Ignora o que já estava preenchido — usado no botão "Recalcular", que é
  // uma ação explícita de "descarta meus ajustes e usa os valores do topo".
  function recalcularTudo() {
    if (!vencimentoSeed) return;
    const base = new Date(`${vencimentoSeed}T00:00:00.000Z`);
    setParcelas(
      Array.from({ length: numeroParcelas }, (_, i) => ({
        vencimento: paraDataInput(adicionarMeses(base, i)),
        valor: valorSeed,
      }))
    );
  }

  // Gera a grade automaticamente quando o número de parcelas muda, sem
  // sobrescrever o que a usuária já ajustou em cada linha. Ajusta durante o
  // render (comparando com o valor anterior) em vez de useEffect — é o
  // padrão recomendado pelo React pra "reagir a uma mudança", e evita uma
  // renderização extra. Mesma ideia do hook useFormKey.
  const [numeroParcelasAnterior, setNumeroParcelasAnterior] = useState(numeroParcelas);
  if (numeroParcelas !== numeroParcelasAnterior) {
    setNumeroParcelasAnterior(numeroParcelas);
    if (numeroParcelas > 1) regenerarParcelas(numeroParcelas);
  }

  function atualizarParcela(i: number, campo: keyof Parcela, valor: string) {
    setParcelas((atual) => atual.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
  }

  const mostrarGradeParcelas = !modoEdicao && !recorrente && numeroParcelas > 1;

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="postoId" className="text-sm font-medium text-foreground/80">
            Posto
          </label>
          <select id="postoId" name="postoId" defaultValue={v?.postoId ?? ""} className={campoSelect} required>
            <option value="" disabled>
              Escolha um posto
            </option>
            {postos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="fornecedorId" className="text-sm font-medium text-foreground/80">
              Fornecedor
            </label>
            <button
              type="button"
              onClick={() => setMostrarNovoFornecedor((s) => !s)}
              className="text-xs text-foreground/60 underline"
            >
              {mostrarNovoFornecedor ? "Cancelar" : "+ Novo fornecedor"}
            </button>
          </div>
          <select
            id="fornecedorId"
            name="fornecedorId"
            value={fornecedorSelecionado}
            onChange={(e) => aoMudarFornecedor(e.target.value)}
            className={campoSelect}
            required
          >
            <option value="" disabled>
              Escolha um fornecedor
            </option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          {mostrarNovoFornecedor && (
            <div className="mt-1 space-y-2 rounded-md border border-black/10 p-3 dark:border-white/15">
              <input
                placeholder="Nome do fornecedor"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className={`${campoSelect} w-full`}
              />
              <input
                placeholder="CNPJ ou CPF (opcional)"
                value={novoDocumento}
                onChange={(e) => setNovoDocumento(e.target.value)}
                className={`${campoSelect} w-full`}
              />
              {erroFornecedor && <p className="text-xs text-red-600 dark:text-red-400">{erroFornecedor}</p>}
              <button
                type="button"
                disabled={criandoFornecedor}
                onClick={handleCriarFornecedor}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {criandoFornecedor ? "Salvando..." : "Adicionar fornecedor"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* key força remontar (e reaplicar valorInicial) só quando a sugestão
          muda de verdade — trocar pra um fornecedor sem sugestão, ou pro
          mesmo plano de contas sugerido, não mexe no que já estava
          selecionado. */}
      <SeletorPlanoConta
        key={planoContaSugerido ?? "sem-sugestao"}
        grupos={grupos}
        valorInicial={planoContaSugerido ?? v?.planoContaId}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label="Data de emissão"
          name="dataEmissao"
          type="date"
          required
          defaultValue={v?.dataEmissao}
        />
        <Campo
          label={mostrarGradeParcelas ? "Vencimento da 1ª parcela" : "Data de vencimento"}
          name={mostrarGradeParcelas ? undefined : "dataVencimento"}
          type="date"
          required
          value={vencimentoSeed}
          onChange={(e) => setVencimentoSeed(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label={mostrarGradeParcelas ? "Valor (padrão das parcelas)" : "Valor"}
          name={mostrarGradeParcelas ? undefined : "valor"}
          required
          value={valorSeed}
          onChange={(e) => setValorSeed(e.target.value)}
          placeholder="0,00"
          inputMode="decimal"
        />
        <Campo
          label="Número do documento (opcional)"
          name="numeroDocumento"
          defaultValue={v?.numeroDocumento ?? undefined}
        />
      </div>

      <Campo label="Descrição (opcional)" name="descricao" defaultValue={v?.descricao ?? undefined} />

      <div className="flex flex-col gap-1">
        <Campo
          label="Observação (opcional)"
          name="observacao"
          defaultValue={v?.observacao ?? undefined}
          placeholder="Ex: dados bancários, desconto/acréscimo combinado, senha do boleto..."
        />
        <p className="text-xs text-foreground/50">
          Informação de apoio pra quem for pagar — não aparece na listagem, só editando aqui. Some como
          comentário (passa o mouse pra ver) na Conferência Diária.
        </p>
      </div>

      {!modoEdicao && (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <div className="flex items-center gap-2">
            <input
              id="recorrente"
              type="checkbox"
              name="recorrente"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
            />
            <label htmlFor="recorrente" className="text-sm">
              Despesa mensal recorrente (o sistema relança automaticamente, com previsão até o fim do ano)
            </label>
          </div>

          {!recorrente && (
            <Campo
              label="Número de parcelas"
              name="numeroParcelas"
              type="number"
              value={numeroParcelas}
              onChange={(e) => setNumeroParcelas(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              min={1}
              max={60}
            />
          )}

          {mostrarGradeParcelas && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground/80">Parcelas (ajuste vencimento e valor se precisar)</p>
                <button
                  type="button"
                  onClick={recalcularTudo}
                  className="text-xs text-foreground/60 underline"
                >
                  Recalcular a partir dos valores acima
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
                <table className="w-full text-sm">
                  <thead className="bg-black/5 dark:bg-white/5">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Parcela</th>
                      <th className="px-3 py-2 text-left font-medium">Vencimento</th>
                      <th className="px-3 py-2 text-left font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p, i) => (
                      <tr key={i} className="border-t border-black/5 dark:border-white/10">
                        <td className="px-3 py-2 text-foreground/60">
                          {i + 1}/{numeroParcelas}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            name="parcelaVencimento"
                            value={p.vencimento}
                            onChange={(e) => atualizarParcela(i, "vencimento", e.target.value)}
                            required
                            className={campoSelect}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            name="parcelaValor"
                            value={p.valor}
                            onChange={(e) => atualizarParcela(i, "valor", e.target.value)}
                            required
                            inputMode="decimal"
                            className={campoSelect}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-foreground/50">
            Parcelamento gera todas as parcelas de uma vez, já com vencimento
            sugerido no mesmo dia dos meses seguintes — dá pra ajustar cada
            uma antes de salvar. Não dá pra marcar parcelamento e recorrência
            ao mesmo tempo.
          </p>
        </div>
      )}

      <ErroFormulario mensagem={state?.error} />
      <div className="flex gap-2">
        <SubmitButton>Salvar</SubmitButton>
        <Link
          href="/contas-a-pagar"
          className="rounded-md px-4 py-2 text-sm text-foreground/70 hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
