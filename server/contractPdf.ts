import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import { parseSaleContractDossier } from "../shared/saleContractDossier";

export type SalePdfInput = {
  publicSaleId?: string | null;
  titularTroca: boolean;
  portabilidadeMovel: boolean;
  portabilidadeFixa: boolean;
  desativacaoApoiada: boolean;
  antigoTitularNome?: string | null;
  antigoTitularNif?: string | null;
  saleContractDossier?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
};

function pickNome(dossier: Record<string, string>, sale: SalePdfInput): string {
  return dossier.nome_cliente?.trim() || sale.contactName?.trim() || "—";
}

function pickNif(dossier: Record<string, string>, sale: SalePdfInput, useAntigo: boolean): string {
  if (useAntigo) {
    return sale.antigoTitularNif?.trim() || dossier.contribuinte?.trim() || "—";
  }
  return dossier.contribuinte?.trim() || "—";
}

async function buildSimplePdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  page.drawText(title, { x: 50, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 28;
  for (const line of lines) {
    if (y < 60) break;
    page.drawText(line.slice(0, 90), { x: 50, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 14;
  }
  page.drawText("Gerado automaticamente pelo CRM Telecom Energia", {
    x: 50,
    y: 30,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  return doc.save();
}

/** Gera PDFs preenchidos e devolve ZIP em base64. */
export async function generateContractPdfZip(sale: SalePdfInput): Promise<{
  zipBase64: string;
  filenames: string[];
}> {
  const dossier = parseSaleContractDossier(sale.saleContractDossier);
  const ref = sale.publicSaleId || "SEM-SALE-ID";
  const zip = new JSZip();
  const filenames: string[] = [];

  const novoNome = pickNome(dossier, sale);
  const novoNif = pickNif(dossier, sale, false);
  const antigoNome = sale.antigoTitularNome?.trim() || novoNome;
  const antigoNif = pickNif(dossier, sale, true);

  const adesaoLines = [
    `Referência: ${ref}`,
    `Novo titular: ${novoNome}`,
    `NIF: ${novoNif}`,
    `Telefone: ${sale.contactPhone || dossier.contacto || "—"}`,
    `Morada: ${dossier.morada || "—"}`,
    `CP: ${dossier.cp || "—"} · ${dossier.localidade || "—"}`,
    `Pacote: ${dossier.pacote || "—"}`,
    `Valor: ${dossier.valor_final || "—"}`,
  ];
  zip.file(`adesao-${ref}.pdf`, await buildSimplePdf("Contrato de Adesão", adesaoLines));
  filenames.push(`adesao-${ref}.pdf`);

  if (sale.portabilidadeMovel) {
    const mobLines = [
      `Referência: ${ref}`,
      `Titular portabilidade: ${sale.titularTroca ? antigoNome : novoNome}`,
      `NIF: ${sale.titularTroca ? antigoNif : novoNif}`,
      `NR_1: ${dossier.nr_1 || "—"} · CVP: ${dossier.cvp_1 || "—"} · KMAT: ${dossier.kmat_1 || "—"}`,
      `NR_2: ${dossier.nr_2 || "—"} · CVP: ${dossier.cvp_2 || "—"} · KMAT: ${dossier.kmat_2 || "—"}`,
    ];
    zip.file(`portabilidade-movel-${ref}.pdf`, await buildSimplePdf("Portabilidade Móvel", mobLines));
    filenames.push(`portabilidade-movel-${ref}.pdf`);
  }

  if (sale.portabilidadeFixa) {
    const fixLines = [
      `Referência: ${ref}`,
      `Titular: ${sale.titularTroca ? antigoNome : novoNome}`,
      `NIF: ${sale.titularTroca ? antigoNif : novoNif}`,
      `Fixo: ${dossier.fixo || dossier.numero_fixo || "—"}`,
      `CVP FX: ${dossier.cvp_fx || "—"}`,
    ];
    zip.file(`portabilidade-fixa-${ref}.pdf`, await buildSimplePdf("Portabilidade Fixa", fixLines));
    filenames.push(`portabilidade-fixa-${ref}.pdf`);
  }

  if (sale.desativacaoApoiada) {
    const desLines = [
      `Referência: ${ref}`,
      `Titular a desactivar: ${antigoNome}`,
      `NIF: ${antigoNif}`,
      `Observações: ${dossier.desat_apoiada || "—"}`,
    ];
    zip.file(`desativacao-apoiada-${ref}.pdf`, await buildSimplePdf("Desativação Apoiada", desLines));
    filenames.push(`desativacao-apoiada-${ref}.pdf`);
  }

  const zipBytes = await zip.generateAsync({ type: "uint8array" });
  const zipBase64 = Buffer.from(zipBytes).toString("base64");
  return { zipBase64, filenames };
}
