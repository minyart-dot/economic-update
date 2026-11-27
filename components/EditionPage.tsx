import type { ReactNode } from "react";
import { fmtR, metroPermitStats } from "@/lib/analytics";
import { colorFor, computeChange } from "@/lib/compare";
import { loadSections, loadTexasAnnual } from "@/lib/data";
import { formatInt, formatPctChange, hostname } from "@/lib/format";
import { GLOSSARY } from "@/lib/glossary";
import type { Edition, Metric, TileSeed } from "@/lib/types";
import { AlertBanner } from "./AlertBanner";
import { AssetCard } from "./AssetCard";
import { Callout, NoteBox } from "./Callout";
import { ChangePill } from "./ChangeArrow";
import { DataTable } from "./DataTable";
import { Figure } from "./Figure";
import { Footer } from "./Footer";
import { HeaderBand } from "./HeaderBand";
import { NextMonthStrip } from "./NextMonthStrip";
import { BulletList } from "./RichText";
import { SectionHeader } from "./SectionHeader";
import { SectionNav } from "./SectionNav";
import { SourceLink } from "./SourceLink";
import { StatTile } from "./StatTile";

function Section({ id, children, hideHeader = false }: { id: string; children: ReactNode; hideHeader?: boolean }) {
  const sec = loadSections().find((s) => s.id === id);
  if (!sec) throw new Error(`Unknown section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="edition-section scroll-mt-16 pt-10 first:pt-6 lg:scroll-mt-4">
      {hideHeader ? (
        <h2 id={`${id}-title`} className="sr-only">
          {sec.title}
        </h2>
      ) : (
        <SectionHeader id={id} number={sec.number} title={sec.title} kicker={sec.kicker} />
      )}
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[16px] font-bold text-navy">{children}</h3>;
}

function Tiles({ tiles, metrics, cols = 3 }: { tiles: TileSeed[]; metrics: Record<string, Metric>; cols?: 3 | 4 }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols === 4 ? "lg:grid-cols-4" : "sm:grid-cols-3"}`}>
      {tiles.map((t) => (
        <StatTile key={t.metric} metric={metrics[t.metric]} label={t.label} sub={t.sub} tone={t.tone} />
      ))}
    </div>
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">{children}</div>;
}

export function EditionPage({ ed }: { ed: Edition }) {
  const m = ed.metrics;
  const s = ed.sections;
  const tx = loadTexasAnnual();
  const nav = loadSections().map((x) => ({ id: x.id, number: x.number || "•", label: x.nav }));

  // Key indicators: group label rows + metric rows.
  const kiRows: { cells?: ReactNode[]; group?: string }[] = [];
  let lastArea = "";
  for (const r of ed.tables.key_indicators) {
    if (r.area !== lastArea) {
      kiRows.push({ group: r.area });
      lastArea = r.area;
    }
    const met = m[r.metric];
    kiRows.push({
      cells: [
        <SourceLink key="l" href={met.source_url} title={`${met.source_name} · as of ${met.as_of}`}>
          {r.label ?? met.label}
        </SourceLink>,
        r.latest,
        r.year_ago,
        r.ref_2019,
        <ChangePill key="p" metric={met} />,
      ],
    });
  }

  return (
    <>
      <HeaderBand editionLabel={ed.edition_label} dataAsOf={ed.data_as_of_label} />
      <div className="mx-auto max-w-[1340px] lg:grid lg:grid-cols-[210px_minmax(0,1100px)] lg:gap-8 lg:px-6">
        <SectionNav items={nav} />
        <main id="main" className="min-w-0 px-4 pb-8 sm:px-6 lg:px-0">
          {/* 1 · Summary */}
          <Section id="summary" hideHeader>
            <AlertBanner alert={ed.alert} variant="compact" />
            <Tiles tiles={ed.tiles.headline} metrics={m} cols={4} />
            <Callout title="The month in brief">
              <p>{ed.month_in_brief}</p>
            </Callout>
            <div>
              <H3>By investment type</H3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ed.asset_cards.map((c) => (
                  <AssetCard key={c.asset} card={c} metric={m[c.metric]} />
                ))}
              </div>
            </div>
            <NextMonthStrip items={ed.next_month} />
            <NoteBox title="Comparisons">{ed.notes.comparisons}</NoteBox>
          </Section>

          {/* 2 · Key indicators */}
          <Section id="key-indicators">
            <DataTable
              caption="Key indicators: latest, year ago, 2019 and change vs. a year ago"
              columns={[
                { header: "Indicator", className: "min-w-[180px]" },
                { header: "Latest", className: "whitespace-nowrap" },
                { header: "Year ago" },
                { header: "2019" },
                { header: "Change vs. year ago" },
              ]}
              rows={kiRows}
            />
            <NoteBox>{ed.notes.key_indicators}</NoteBox>
          </Section>

          {/* 3 · Reading the data together */}
          <Section id="story">
            <Callout title="Big picture">
              <p>{ed.big_picture}</p>
            </Callout>
            <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 [&>*]:min-w-0">
              {ed.themes.map((t, i) => (
                <div key={t.title} className="avoid-break">
                  <H3>
                    {i + 1} · {t.title}
                  </H3>
                  <BulletList bullets={t.bullets} className="text-[14px]" />
                </div>
              ))}
            </div>
            <Figure id="C15" />
            <div>
              <H3>How the series have moved together (annual, 2006–2025)</H3>
              <DataTable
                minWidth={520}
                columns={[
                  { header: "Relationship", className: "min-w-[200px]" },
                  { header: "Correlation", numeric: true },
                  { header: "Plain terms" },
                ]}
                rows={ed.correlations.map((c) => ({
                  cells: [
                    c.label,
                    <span key="r" className="font-semibold">
                      {fmtR(c.r)}
                      <span className="block text-[11px] font-normal text-muted">n = {c.n}</span>
                    </span>,
                    <span key="p">
                      {c.plain}
                      {c.note && <span className="block text-[11px] text-muted">{c.note}</span>}
                    </span>,
                  ],
                }))}
              />
            </div>
            <NoteBox>{ed.notes.correlations}</NoteBox>
          </Section>

          {/* 4 · 20-year view */}
          <Section id="twenty-year">
            <TwoCol>
              <div className="space-y-3">
                <Figure id="C1" />
                <BulletList bullets={s["twenty-year"].c1_bullets} className="text-[14px]" />
              </div>
              <div className="space-y-3">
                <Figure id="C2" />
                <BulletList bullets={s["twenty-year"].c2_bullets} className="text-[14px]" />
              </div>
            </TwoCol>
          </Section>

          {/* 5 · Jobs and AI */}
          <Section id="jobs-ai">
            <Figure id="C3" />
            <Figure id="C4" />
            <BulletList bullets={s["jobs-ai"].bullets} />
          </Section>

          {/* 6 · Household credit */}
          <Section id="credit">
            <TwoCol>
              <Figure id="C5" />
              <Figure id="C6" />
            </TwoCol>
            <BulletList bullets={s.credit.bullets} />
          </Section>

          {/* 7 · Rates, markets and AI investment */}
          <Section id="rates">
            <Tiles tiles={ed.tiles.rates} metrics={m} />
            <BulletList bullets={s.rates.bullets} />
          </Section>

          {/* 8 · Market risk gauges */}
          <Section id="gauges">
            <AlertBanner alert={ed.alert} variant="full" />
            <Tiles tiles={ed.tiles.gauges} metrics={m} />
            <Figure id="C17" />
            <BulletList bullets={s.gauges.bullets} />
            <DataTable
              columns={[
                { header: "Gauge" },
                { header: "What it measures" },
                { header: "Commonly watched levels" },
                { header: "Why investors watch it" },
              ]}
              rows={ed.tables.gauge_explainer.map((g) => ({
                cells: [<strong key="g">{g.gauge}</strong>, g.measures, g.levels, g.why],
              }))}
            />
            <NoteBox title="VIX alert rule">{ed.notes.vix_rule}</NoteBox>
          </Section>

          {/* 9 · Housing, permits, manufactured homes */}
          <Section id="housing">
            <Figure id="C7" />
            <TwoCol>
              <div>
                <H3>Building permits</H3>
                <BulletList bullets={s.housing.permit_bullets} className="text-[14px]" />
              </div>
              <div>
                <H3>Sales, prices and mortgage stress</H3>
                <BulletList bullets={s.housing.sales_bullets} className="text-[14px]" />
              </div>
            </TwoCol>
            <TwoCol>
              <Figure id="C8" />
              <div className="lg:pt-7">
                <H3>Manufactured homes</H3>
                <BulletList bullets={s.housing.mh_bullets} className="text-[14px]" />
              </div>
            </TwoCol>
          </Section>

          {/* 10 · Months of inventory */}
          <Section id="inventory">
            <Callout title="How to read it">
              <p>{s.inventory.how_to_read}</p>
            </Callout>
            <Figure id="C16" />
            <DataTable
              columns={[
                { header: "Market", className: "min-w-[150px]" },
                { header: "Property type" },
                { header: "Months of inventory", numeric: true },
                { header: "Year ago", numeric: true },
                { header: "Median price" },
                { header: "Sales y/y", numeric: true },
              ]}
              rows={ed.tables.inventory.map((r) => ({
                cells: [
                  <SourceLink key="m" href={r.source_url} title={hostname(r.source_url)}>
                    {r.market}
                  </SourceLink>,
                  r.type,
                  r.months,
                  r.year_ago,
                  r.median,
                  r.sales_yy,
                ],
              }))}
            />
            <NoteBox>{ed.notes.inventory}</NoteBox>
            <BulletList bullets={s.inventory.bullets} />
          </Section>

          {/* 11 · Commercial real estate */}
          <Section id="cre">
            <Tiles tiles={ed.tiles.cre} metrics={m} />
            <TwoCol>
              <Figure id="C9" />
              <Figure id="C10" />
            </TwoCol>
            <BulletList bullets={s.cre.bullets} />
            <TwoCol>
              <Figure id="C11" />
              <div className="lg:pt-7">
                <H3>Texas commercial</H3>
                <BulletList bullets={s.cre.texas_bullets} className="text-[14px]" />
              </div>
            </TwoCol>
          </Section>

          {/* 12 · Texas metros */}
          <Section id="tx-metros">
            <DataTable
              minWidth={760}
              columns={[
                { header: "Metro", className: "min-w-[110px]" },
                { header: "Permits Jan–Sep 2026", numeric: true },
                { header: "vs. 2025" },
                { header: "Permits 2019", numeric: true },
                { header: "Peak year", numeric: true },
                { header: "Median rent (Oct)", numeric: true },
                { header: "Rent y/y", numeric: true },
                { header: "Office vacancy", numeric: true },
              ]}
              rows={ed.tables.metros.map((r) => {
                const stats = r.history_key ? metroPermitStats(tx, r.history_key) : null;
                const ch = computeChange(r.permits_yy_pct != null ? 1 : null, null, r.permits_yy_pct != null ? { pct: r.permits_yy_pct } : null, "count");
                return {
                  cells: [
                    <strong key="n">{r.metro}</strong>,
                    r.permits_url ? (
                      <SourceLink key="p" href={r.permits_url}>
                        {r.permits_ytd}
                      </SourceLink>
                    ) : (
                      r.permits_ytd
                    ),
                    r.permits_yy_pct != null ? (
                      <ChangePill key="c" direction={ch.direction} color={colorFor(ch.direction, "mixed")} label={formatPctChange(r.permits_yy_pct)} />
                    ) : (
                      "—"
                    ),
                    stats ? formatInt(stats.v2019) : "—",
                    stats ? `${formatInt(stats.peak)} (${stats.peakYear})` : "—",
                    r.rent,
                    r.rent_yy,
                    r.office_vacancy,
                  ],
                };
              })}
            />
            <NoteBox>{ed.notes.tx_metros} Permits 2019 and peak year are computed from the annual FRED series.</NoteBox>
            <Figure id="C12" />
            <TwoCol>
              <Figure id="C13" />
              <Figure id="C14" />
            </TwoCol>
            <BulletList bullets={s["tx-metros"].bullets} />
          </Section>

          {/* 13 · Texas statewide */}
          <Section id="texas">
            <Tiles tiles={ed.tiles.texas} metrics={m} />
            <BulletList bullets={s.texas.bullets} />
          </Section>

          {/* 14 · Europe */}
          <Section id="europe">
            <BulletList bullets={s.europe.bullets} />
          </Section>

          {/* 15 · What to watch */}
          <Section id="watch">
            <TwoCol>
              <div>
                <H3>Reference levels</H3>
                <DataTable
                  minWidth={360}
                  columns={[{ header: "Indicator" }, { header: "Reference level" }, { header: "Today", numeric: true }]}
                  rows={ed.tables.reference_levels.map((r) => ({
                    cells: [
                      r.indicator,
                      r.reference,
                      r.metric ? (
                        <SourceLink key="t" href={m[r.metric].source_url}>
                          {r.today}
                        </SourceLink>
                      ) : (
                        r.today
                      ),
                    ],
                  }))}
                />
              </div>
              <div>
                <H3>Release calendar</H3>
                <DataTable
                  minWidth={300}
                  columns={[{ header: "Date", className: "whitespace-nowrap" }, { header: "Release" }]}
                  rows={ed.tables.release_calendar.map((r) => ({ cells: [r.date, r.release] }))}
                />
              </div>
            </TwoCol>
            <NoteBox title="Comparisons and terms">
              {GLOSSARY.map((g, i) => (
                <span key={g.term}>
                  {i > 0 && " "}
                  <strong className="text-dark">{g.term}:</strong> {g.definition}
                </span>
              ))}{" "}
              <em>Not investment advice.</em>
            </NoteBox>
          </Section>

          {/* 16 · References */}
          <Section id="references">
            <div className="gap-8 text-[13px] md:columns-2">
              {ed.references.map((g) => (
                <div key={g.section} className="mb-5 break-inside-avoid">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-teal">{g.title}</p>
                  <ul className="space-y-1">
                    {g.items.map((it) => (
                      <li key={it.url} className="leading-snug">
                        <SourceLink href={it.url}>{it.title}</SourceLink>{" "}
                        <span className="text-[11px] text-muted">{hostname(it.url)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
        </main>
      </div>
      <Footer editionLabel={ed.edition_label} />
    </>
  );
}
