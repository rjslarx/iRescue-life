import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { ExpenseCampaign, CampaignMatchPool } from "@shared/schema";
import { matchingTierProgress } from "@shared/matching-milestones";

interface SponsorInvoiceInput {
  tenantName: string;
  tenantEin: string | null;
  campaign: ExpenseCampaign;
  pool: CampaignMatchPool;
  donations: Array<{
    date: Date | null;
    donorName: string;
    amount: number | null;
    matchedAmountCents: number;
  }>;
}

const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function generateSponsorInvoicePdf(input: SponsorInvoiceInput): Promise<Buffer> {
  const { tenantName, tenantEin, campaign, pool, donations } = input;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([612, 792]);
  let { width, height } = page.getSize();
  let y = height - 60;

  const drawText = (text: string, x: number, opts: { size?: number; bold?: boolean; color?: any } = {}) => {
    page.drawText(text, {
      x,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: opts.color ?? rgb(0.1, 0.1, 0.1),
    });
  };

  const newLine = (n = 16) => {
    y -= n;
    if (y < 60) {
      page = doc.addPage([612, 792]);
      ({ width, height } = page.getSize());
      y = height - 60;
    }
  };

  drawText(tenantName, 50, { size: 18, bold: true });
  newLine(20);
  if (tenantEin) {
    drawText(`EIN: ${tenantEin}`, 50, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    newLine(18);
  } else {
    newLine(8);
  }

  drawText("Matching-Gift Sponsor Invoice", 50, { size: 14, bold: true });
  newLine(22);

  drawText(`Campaign: ${campaign.title}`, 50, { bold: true });
  newLine();
  drawText(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50);
  newLine(22);

  drawText("Sponsor", 50, { bold: true, size: 12 });
  newLine();
  drawText(`Name:  ${pool.internalSponsorName}`, 50);
  newLine();
  drawText(`Email: ${pool.internalSponsorEmail}`, 50);
  newLine(22);

  if (pool.tiers?.length) {
    drawText("Sequential sponsor commitments (dollar-for-dollar)", 50, { bold: true });
    newLine(20);
    for (const tier of matchingTierProgress(pool.tiers, pool.totalMatchedCents)) {
      drawText(tier.internalSponsorName.slice(0, 65), 50, { bold: true });
      newLine();
      drawText(tier.internalSponsorEmail.slice(0, 80), 50, { size: 10 });
      newLine();
      drawText(`Pledged: ${fmt(tier.pledgedCapCents)} | Match owed: ${fmt(tier.totalMatchedCents)} | Remaining: ${fmt(tier.remainingCents)}`, 50, { size: 10 });
      newLine(22);
    }
  }

  drawText("Pledge Summary", 50, { bold: true, size: 12 });
  newLine();
  drawText(`Pledged cap:    ${fmt(pool.pledgedCapCents)}`, 50);
  newLine();
  drawText(`Total matched:  ${fmt(pool.totalMatchedCents)}`, 50);
  newLine();
  const remaining = Math.max(0, pool.pledgedCapCents - pool.totalMatchedCents);
  drawText(`Remaining:      ${fmt(remaining)}`, 50);
  newLine();
  drawText(`Match ratio:    ${pool.ratioNumerator}:${pool.ratioDenominator}`, 50);
  if (pool.perGiftCapCents != null) {
    newLine();
    drawText(`Per-gift cap:   ${fmt(pool.perGiftCapCents)}`, 50);
  }
  newLine(24);

  drawText("Matched Donations", 50, { bold: true, size: 12 });
  newLine(18);

  // Table header
  drawText("Date", 50, { bold: true, size: 10 });
  drawText("Donor", 140, { bold: true, size: 10 });
  drawText("Gift", 380, { bold: true, size: 10 });
  drawText("Match Owed", 470, { bold: true, size: 10 });
  newLine(4);
  page.drawLine({ start: { x: 50, y }, end: { x: 560, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  newLine(12);

  for (const d of donations) {
    const dateStr = d.date ? new Date(d.date).toLocaleDateString("en-US") : "—";
    drawText(dateStr, 50, { size: 10 });
    drawText((d.donorName || "Anonymous").slice(0, 36), 140, { size: 10 });
    drawText(fmt(d.amount ?? 0), 380, { size: 10 });
    drawText(fmt(d.matchedAmountCents), 470, { size: 10 });
    newLine(14);
  }

  newLine(10);
  page.drawLine({ start: { x: 50, y }, end: { x: 560, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  newLine(14);
  drawText(`Total amount owed by sponsor:`, 50, { bold: true });
  drawText(fmt(pool.totalMatchedCents), 470, { bold: true });
  newLine(28);

  drawText("Thank you", 50, { bold: true, size: 12 });
  newLine(16);
  const thanks = [
    `Your matching pledge for "${campaign.title}" has unlocked ${fmt(pool.totalMatchedCents)} of`,
    `additional support for ${tenantName}. Each dollar you've pledged multiplied the impact of`,
    `every gift listed above. We are deeply grateful for your generosity.`,
  ];
  for (const line of thanks) {
    drawText(line, 50, { size: 10 });
    newLine(14);
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
