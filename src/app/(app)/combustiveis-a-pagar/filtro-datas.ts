function dataUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// Filtro de datas das telas, do relatório e do Excel de Combustíveis a Pagar: vencimento (de/até) e descarga
// (descDe/descAte). A descarga serve pra fechar o mês só com o que foi descarregado nele.
export function filtroDatasCombustivel(p: { de?: string | null; ate?: string | null; descDe?: string | null; descAte?: string | null }) {
  return {
    ...(p.de || p.ate ? { dataVencimento: { ...(p.de ? { gte: dataUTC(p.de) } : {}), ...(p.ate ? { lte: dataUTC(p.ate) } : {}) } } : {}),
    ...(p.descDe || p.descAte ? { dataDescarga: { ...(p.descDe ? { gte: dataUTC(p.descDe) } : {}), ...(p.descAte ? { lte: dataUTC(p.descAte) } : {}) } } : {}),
  };
}
