import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/auth";
import { formatarMoeda } from "@/lib/dinheiro";
import { paraLista } from "@/lib/filtro-multiplo";
import { SeletorDropdown } from "@/components/ui/seletor-dropdown";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { BOTAO_PRIMARIO, CABECALHO_TABELA, CAMPO, CARTAO } from "@/lib/estilo";
import { FormularioUpload } from "./formulario-upload";
import { excluirImportacaoCartao } from "./actions";

// Arquivos multi-posto grandes (ex: Stone com todos os postos juntos, ~18 mil
// linhas) passam de 10s pra processar — bem em cima do limite padrão de
// função serverless. `maxDuration` na página estende o timeout de toda
// Server Action chamada a partir dela (ver importarTransacoesCartaoAction).
export const maxDuration = 60;

export const metadata = { title: "Conferência de Caixa - Envio de arquivos" };

function formatarData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarDataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

// "SulAmerica_premmia.xlsx" e "SUL AMERICA" viram "sulamerica..." e "sulamerica" — pra comparar o nome do arquivo com o posto.
function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default async function UploadCartoesPage({ searchParams }: { searchParams: Promise<{ postoId?: string | string[]; desde?: string }> }) {
  const podeEditar = await podeEditarModulo("CONFERENCIA_CAIXA");
  const { postoId, desde: desdeUrl } = await searchParams;
  const postoIds = paraLista(postoId);

  const postos = await prisma.posto.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
  });

  // Arquivos já enviados (por posto + adquirente + arquivo), os mais recentes primeiro. Por padrão só os
  // últimos 30 dias de envio, pra lista não crescer sem fim.
  const hoje = new Date();
  const padraoDesde = new Date(hoje.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const desde = desdeUrl && /^\d{4}-\d{2}-\d{2}$/.test(desdeUrl) ? desdeUrl : padraoDesde;
  const grupos = await prisma.transacaoCartao.groupBy({
    by: ["postoId", "adquirenteId", "arquivoOrigem"],
    where: { importadoEm: { gte: new Date(`${desde}T00:00:00.000-03:00`) }, ...(postoIds.length ? { postoId: { in: postoIds } } : {}) },
    _count: { _all: true },
    _sum: { valorBruto: true },
    _min: { dataVenda: true },
    _max: { dataVenda: true, importadoEm: true },
  });
  const adquirentes = await prisma.adquirenteCartao.findMany({ select: { id: true, nome: true } });
  const nomeAdquirente = new Map(adquirentes.map((a) => [a.id, a.nome]));
  const nomePosto = new Map(postos.map((p) => [p.id, p.nome]));
  const nomesPostosNormalizados = postos.map((p) => ({ nome: p.nome, norm: semAcento(p.nome) })).filter((p) => p.norm.length >= 4);

  const importacoes = grupos
    .map((g) => {
      const arquivoNorm = semAcento(g.arquivoOrigem);
      const proprio = semAcento(nomePosto.get(g.postoId) ?? "");
      // O nome do arquivo cita outro posto e não cita o posto onde foi gravado: provável envio no posto errado.
      const outro = nomesPostosNormalizados.find((p) => p.norm !== proprio && arquivoNorm.includes(p.norm) && !(proprio && arquivoNorm.includes(proprio)));
      return {
        postoId: g.postoId,
        adquirenteId: g.adquirenteId,
        arquivo: g.arquivoOrigem,
        posto: nomePosto.get(g.postoId) ?? "—",
        adquirente: nomeAdquirente.get(g.adquirenteId) ?? "—",
        vendas: g._count._all,
        bruto: Number(g._sum.valorBruto ?? 0),
        de: g._min.dataVenda,
        ate: g._max.dataVenda,
        importadoEm: g._max.importadoEm!,
        suspeitoDe: outro?.nome ?? null,
      };
    })
    .sort((a, b) => b.importadoEm.getTime() - a.importadoEm.getTime())
    .slice(0, 300);

  const qs = new URLSearchParams();
  for (const id of postoIds) qs.append("postoId", id);
  if (desdeUrl) qs.set("desde", desdeUrl);
  const urlAtual = `/conferencia-caixa/upload${qs.toString() ? `?${qs.toString()}` : ""}`;

  return (
    <div className="space-y-6">
      <p className="text-sm text-foreground/60">
        Upload dos arquivos de venda das adquirentes — alimenta o Relatório de Caixa e, mais pra frente, a
        Conciliação de Cartões.
      </p>

      {podeEditar ? (
        <FormularioUpload postos={postos} />
      ) : (
        <p className="rounded-lg border border-black/10 px-4 py-6 text-center text-sm text-foreground/50 dark:border-white/15">
          Você não tem permissão pra importar arquivos de cartão.
        </p>
      )}

      <section className="space-y-3" aria-label="Arquivos já enviados">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Arquivos já enviados</h2>
          <p className="text-sm text-foreground/60">
            Cada linha é um arquivo gravado num posto. Se um arquivo foi enviado no posto errado (ou é o arquivo errado), exclua a importação aqui
            e envie de novo — só as vendas daquele arquivo naquele posto são apagadas.
          </p>
        </div>

        <form className={`${CARTAO} flex flex-wrap items-end gap-4 px-5 py-4 text-sm`}>
          <div className="flex flex-col gap-1">
            <label className="text-foreground/60">Posto</label>
            <SeletorDropdown nome="postoId" rotuloTodos="Todos os postos" selecionados={postoIds} itens={postos.map((p) => ({ id: p.id, nome: p.nome }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="desde" className="text-foreground/60">
              Enviados desde
            </label>
            <input id="desde" type="date" name="desde" defaultValue={desde} className={CAMPO} />
          </div>
          <button type="submit" className={BOTAO_PRIMARIO}>
            Filtrar
          </button>
          {(postoIds.length > 0 || desdeUrl) && (
            <Link href="/conferencia-caixa/upload" className="self-center text-foreground/60 underline">
              Limpar filtros
            </Link>
          )}
        </form>

        {importacoes.length === 0 ? (
          <p className="py-6 text-center text-sm text-foreground/50">Nenhum arquivo enviado nesse período.</p>
        ) : (
          <div className={`${CARTAO} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead className={CABECALHO_TABELA}>
                <tr>
                  <th className="px-4 py-2.5 text-left">Enviado em</th>
                  <th className="px-4 py-2.5 text-left">Posto</th>
                  <th className="px-4 py-2.5 text-left">Adquirente</th>
                  <th className="px-4 py-2.5 text-left">Arquivo</th>
                  <th className="px-4 py-2.5 text-right">Vendas</th>
                  <th className="px-4 py-2.5 text-left">Período</th>
                  <th className="px-4 py-2.5 text-right">Valor bruto</th>
                  {podeEditar && <th className="px-4 py-2.5 text-right"></th>}
                </tr>
              </thead>
              <tbody>
                {importacoes.map((i) => (
                  <tr key={`${i.postoId}|${i.adquirenteId}|${i.arquivo}`} className="border-t border-black/10 align-top dark:border-white/10">
                    <td className="px-4 py-2 whitespace-nowrap">{formatarDataHora(i.importadoEm)}</td>
                    <td className="px-4 py-2 font-medium">{i.posto}</td>
                    <td className="px-4 py-2">{i.adquirente}</td>
                    <td className="px-4 py-2 break-all">
                      {i.arquivo}
                      {i.suspeitoDe && (
                        <span className="mt-0.5 block text-xs font-semibold text-amber-700 dark:text-amber-400">
                          ⚠ O nome do arquivo parece ser do posto {i.suspeitoDe}, mas foi gravado em {i.posto}.
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{i.vendas}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{i.de && i.ate ? `${formatarData(i.de)} a ${formatarData(i.ate)}` : "—"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">{formatarMoeda(i.bruto)}</td>
                    {podeEditar && (
                      <td className="px-4 py-2 text-right">
                        <form action={excluirImportacaoCartao}>
                          <input type="hidden" name="postoId" value={i.postoId} />
                          <input type="hidden" name="adquirenteId" value={i.adquirenteId} />
                          <input type="hidden" name="arquivoOrigem" value={i.arquivo} />
                          <input type="hidden" name="voltarPara" value={urlAtual} />
                          <ConfirmSubmitButton
                            confirmMessage={`Excluir a importação "${i.arquivo}" do posto ${i.posto}? Serão apagadas ${i.vendas} venda${i.vendas === 1 ? "" : "s"} (${formatarMoeda(i.bruto)}). Essa ação não pode ser desfeita.`}
                          >
                            Excluir importação
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
