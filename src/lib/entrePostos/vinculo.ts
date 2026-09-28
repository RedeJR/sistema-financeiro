import "server-only";
import { prisma } from "@/lib/prisma";

// Vínculo entre uma movimentação (empréstimo/devolução) e o lançamento real
// do extrato bancário — evita contar o mesmo dinheiro duas vezes (uma no
// extrato, outra em Entre Postos) e é como o sistema confirma que nada foi
// esquecido (ver comentário no schema, MovimentacaoEntrePostos).

const JANELA_DIAS = 5;
const TOLERANCIA = 0.02;

export type CandidatoLancamento = {
  id: string;
  data: Date;
  descricao: string;
  valor: number;
  categoriaNome: string | null;
  bancoNome: string;
};

// Lançamentos do posto e valor esperado (já com o sinal certo — negativo pra
// quem manda, positivo pra quem recebe) que ainda não estão vinculados a
// NENHUMA movimentação, numa janela de dias em torno da data da
// movimentação. Não filtra por categoria — o lançamento pode estar em
// "Outros" ou qualquer outra, é exatamente o que a usuária vai corrigir ao
// vincular.
async function buscarCandidatos(params: { postoId: string; data: Date; valorComSinal: string; lado: "origem" | "destino" }): Promise<CandidatoLancamento[]> {
  const { postoId, data, valorComSinal, lado } = params;
  const de = new Date(data.getTime() - JANELA_DIAS * 86400000);
  const ate = new Date(data.getTime() + JANELA_DIAS * 86400000);
  const alvo = Number(valorComSinal);

  const campoVinculo = lado === "origem" ? "movimentacoesEntrePostosOrigem" : "movimentacoesEntrePostosDestino";
  const lancamentos = await prisma.lancamentoExtrato.findMany({
    where: {
      postoId,
      data: { gte: de, lte: ate },
      valor: { gte: (alvo - TOLERANCIA).toFixed(2), lte: (alvo + TOLERANCIA).toFixed(2) },
      [campoVinculo]: { none: {} },
    },
    include: { categoria: true, banco: true },
    orderBy: { data: "asc" },
  });
  return lancamentos.map((l) => ({
    id: l.id,
    data: l.data,
    descricao: l.descricao,
    valor: Number(l.valor),
    categoriaNome: l.categoria?.nome ?? null,
    bancoNome: l.banco.nome,
  }));
}

export async function sugerirCandidatosVinculo(movimentacaoId: string): Promise<{
  origemCandidatos: CandidatoLancamento[];
  destinoCandidatos: CandidatoLancamento[];
}> {
  const mov = await prisma.movimentacaoEntrePostos.findUniqueOrThrow({ where: { id: movimentacaoId } });
  const valor = Number(mov.valor);
  const [origemCandidatos, destinoCandidatos] = await Promise.all([
    mov.lancamentoExtratoOrigemId
      ? []
      : buscarCandidatos({ postoId: mov.postoOrigemId, data: mov.data, valorComSinal: (-valor).toFixed(2), lado: "origem" }),
    mov.lancamentoExtratoDestinoId
      ? []
      : buscarCandidatos({ postoId: mov.postoDestinoId, data: mov.data, valorComSinal: valor.toFixed(2), lado: "destino" }),
  ]);
  return { origemCandidatos, destinoCandidatos };
}

const CATEGORIA_ENTRE_POSTOS_NOME = "ENTRE POSTOS";

// Vincula e recategoriza o lançamento pra "ENTRE POSTOS" — assim ele some de
// "Outros" (ou onde estivesse) e passa a refletir certo no Fechamento de
// Extratos, sem duplicar com o total da movimentação.
export async function vincularLancamento(params: { movimentacaoId: string; lado: "origem" | "destino"; lancamentoExtratoId: string }) {
  const { movimentacaoId, lado, lancamentoExtratoId } = params;
  const categoria = await prisma.categoriaExtrato.findUniqueOrThrow({ where: { nome: CATEGORIA_ENTRE_POSTOS_NOME } });
  await prisma.$transaction([
    prisma.movimentacaoEntrePostos.update({
      where: { id: movimentacaoId },
      data:
        lado === "origem"
          ? { lancamentoExtratoOrigemId: lancamentoExtratoId }
          : { lancamentoExtratoDestinoId: lancamentoExtratoId },
    }),
    prisma.lancamentoExtrato.update({ where: { id: lancamentoExtratoId }, data: { categoriaId: categoria.id } }),
  ]);
}

// Desfaz o vínculo — não mexe na categoria do lançamento (pode ter sido
// ajustada por outro motivo depois; se a usuária quiser, recategoriza na
// tela de Editar Extrato como qualquer outra linha).
export async function desvincularLancamento(params: { movimentacaoId: string; lado: "origem" | "destino" }) {
  const { movimentacaoId, lado } = params;
  await prisma.movimentacaoEntrePostos.update({
    where: { id: movimentacaoId },
    data: lado === "origem" ? { lancamentoExtratoOrigemId: null } : { lancamentoExtratoDestinoId: null },
  });
}
