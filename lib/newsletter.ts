// Monthly email built from the edition JSON (spec Section 13.3). Simple, inline-styled,
// table-based HTML that renders in Gmail, Outlook and Apple Mail, plus a plain-text version.

import { ARROW } from "./compare";
import type { Edition, Metric } from "./types";

const COLOR = { navy: "#14213D", teal: "#1F7A8C", orange: "#E07A2E", ink: "#1E2430", muted: "#5C6470", border: "#E1E6EC", panel: "#F4F6F8" };
const CHANGE = { good: "#1E7A36", bad: "#B22222", neutral: "#1E2430" } as const;
const ALERT = { normal: "#1E7A36", elevated: "#8A5200", high: "#B22222", extreme: "#8B0000" } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function arrowHtml(m: Metric): string {
  if (!m.direction || !m.color) return "";
  return ` <span style="color:${CHANGE[m.color]};font-size:13px">${ARROW[m.direction]}</span><span style="color:${COLOR.muted};font-size:11px"> y/y</span>`;
}
function arrowText(m: Metric): string {
  return m.direction ? ` ${ARROW[m.direction]} y/y` : "";
}

export interface Newsletter {
  subject: string;
  preheader: string;
  html: string;
  text: string;
  editionUrl: string;
  pdfUrl: string | null;
}

/**
 * @param pdfPath site-relative path of the rendered PDF (e.g. "/editions/2026-11.pdf"), or null
 *                when there is none; the email then leaves out the PDF link (spec 13.3 item 6).
 */
export function buildNewsletter(ed: Edition, siteUrl: string, pdfPath: string | null = null): Newsletter {
  const base = siteUrl.replace(/\/$/, "");
  const editionUrl = `${base}/archive/${ed.edition}`;
  const pdfUrl = pdfPath ? `${base}${pdfPath}` : null;
  const subject = `State of the Market, ${ed.edition_label}: ${ed.headline_summary}`;
  const preheader = ed.month_in_brief.split(/(?<=\.)\s/)[0];
  const alertLine = ed.alert.text + (ed.alert.inverted && ed.alert.inversion_text ? ` · ${ed.alert.inversion_text}` : "");

  const tiles = ed.tiles.headline.map((t) => ({ t, m: ed.metrics[t.metric] }));
  const tileCell = ({ t, m }: (typeof tiles)[number]) => `
        <td width="50%" valign="top" style="padding:10px 12px;border:1px solid ${COLOR.border};border-top:3px solid ${COLOR[t.tone]}">
          <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.muted}">${esc(t.label ?? m.label)}</div>
          <div style="font-size:24px;font-weight:700;color:${COLOR.navy};padding-top:2px">${esc(m.display)}${arrowHtml(m)}</div>
          <div style="font-size:12px;color:${COLOR.muted};padding-top:2px">${esc(t.sub)}</div>
        </td>`;

  const footnotes = tiles.map(({ m }) => m.footnote).filter((f): f is string => !!f);

  const cards = ed.asset_cards.map((c) => {
    const m = ed.metrics[c.metric];
    return { c, m, value: c.value_display ?? m.display, fact: c.bullets[0]?.text ?? "" };
  });

  const next = ed.next_month.map((n) => `${n.label} ${n.date}`).join(" · ");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${COLOR.ink};font-size:15px;line-height:1.45">
  <tr><td style="background:${COLOR.navy};padding:20px 22px;color:#ffffff">
    <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#9FB4CC">Monthly brief for real estate investors</div>
    <div style="font-size:26px;font-weight:700;padding-top:4px">State of the Market</div>
    <div style="font-size:14px;color:#D5DDE6;padding-top:2px">${esc(ed.edition_label)} · data as of ${esc(ed.data_as_of_label)}</div>
  </td></tr>
  <tr><td style="height:5px;line-height:5px;font-size:0;background:linear-gradient(90deg,${COLOR.teal} 60%,${COLOR.orange} 60%);background-color:${COLOR.teal}">&nbsp;</td></tr>
  <tr><td style="padding:14px 4px 4px"><div style="font-size:13px;font-weight:600;color:${ALERT[ed.alert.level]};border-left:4px solid ${ALERT[ed.alert.level]};padding:6px 10px;background:${COLOR.panel}">${esc(alertLine)} <span style="font-weight:400;color:${COLOR.ink}">${esc(ed.alert.thresholds)}</span></div></td></tr>
  <tr><td style="padding:10px 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>${tileCell(tiles[0])}${tileCell(tiles[1])}</tr>
      <tr>${tileCell(tiles[2])}${tileCell(tiles[3])}</tr>
    </table>${footnotes.length ? `\n    <div style="font-size:11px;color:${COLOR.muted};padding-top:4px">${footnotes.map(esc).join(" ")}</div>` : ""}
  </td></tr>
  <tr><td style="padding:8px 4px"><div style="background:${COLOR.panel};border-left:3px solid ${COLOR.teal};padding:10px 14px">
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COLOR.teal}">The month in brief</div>
    <div style="padding-top:4px">${esc(ed.month_in_brief)}</div>
  </div></td></tr>
  <tr><td style="padding:12px 4px 4px"><div style="font-size:16px;font-weight:700;color:${COLOR.navy}">By investment type</div></td></tr>
  <tr><td style="padding:0 4px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
      ${cards
        .map(
          ({ c, m, value, fact }) => `<tr><td style="padding:6px 0;border-bottom:1px solid ${COLOR.border}"><strong style="color:${COLOR.navy}">${esc(c.asset)}:</strong> ${esc(value)}${arrowHtml(m)} <span style="color:${COLOR.muted}">·</span> ${esc(fact)}</td></tr>`,
        )
        .join("\n      ")}
    </table>
  </td></tr>
  <tr><td align="center" style="padding:20px 4px 8px">
    <a href="${esc(editionUrl)}" style="display:inline-block;background:${COLOR.teal};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:6px">Read the full brief</a>
    <div style="font-size:12px;color:${COLOR.muted};padding-top:6px">Charts, tables and a source link for every number.${
      pdfUrl ? ` Or <a href="${esc(pdfUrl)}" style="color:${COLOR.teal}">download the PDF</a>.` : ""
    }</div>
  </td></tr>
  <tr><td style="padding:8px 4px"><div style="background:${COLOR.navy};color:#ffffff;font-size:13px;padding:8px 12px;border-radius:4px"><strong style="color:#9FB4CC">NEXT MONTH:</strong> ${esc(next)}</div></td></tr>
  <tr><td style="padding:14px 4px 4px;font-size:12px;color:${COLOR.muted};border-top:1px solid ${COLOR.border}">
    Arrows compare with the same period a year earlier. Green = generally read as favorable, red = unfavorable, black = flat or mixed.<br>
    <strong style="color:${COLOR.ink}">Data only; not investment advice.</strong><br>
    You are receiving this because you subscribed at <a href="${esc(base)}" style="color:${COLOR.teal}">${esc(base.replace(/^https?:\/\//, ""))}</a>. <a href="{{ unsubscribe_url }}" style="color:${COLOR.teal}">Unsubscribe</a>.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `STATE OF THE MARKET · ${ed.edition_label} (data as of ${ed.data_as_of_label})`,
    "",
    alertLine,
    "",
    ...tiles.map(({ t, m }) => `${t.label ?? m.label}: ${m.display}${arrowText(m)} (${t.sub})`),
    ...footnotes,
    "",
    "THE MONTH IN BRIEF",
    ed.month_in_brief,
    "",
    "BY INVESTMENT TYPE",
    ...cards.map(({ c, m, value, fact }) => `- ${c.asset}: ${value}${arrowText(m)} · ${fact}`),
    "",
    `Read the full brief: ${editionUrl}`,
    ...(pdfUrl ? [`PDF: ${pdfUrl}`] : []),
    "",
    `Next month: ${next}`,
    "",
    "Arrows compare with the same period a year earlier. Data only; not investment advice.",
    "Unsubscribe: {{ unsubscribe_url }}",
  ].join("\n");

  return { subject, preheader, html, text, editionUrl, pdfUrl };
}
