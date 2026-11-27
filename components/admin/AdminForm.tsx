"use client";

// The owner's monthly-numbers form. Validation rules are shared with the server (lib/admin/fields.ts);
// the server checks everything again before it writes. Nothing secret is in this component's props:
// field values, the file's blob sha and public GitHub links only.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type FieldErrors,
  type FieldForm,
  type FieldKey,
  type TextKey,
  type FieldMeta,
  PERIOD_HINT,
  type Status,
  UNIT_HINT,
  initialForm,
  isPeriod,
  suggestLabel,
  validateField,
  yearEarlier,
} from "@/lib/admin/fields";

interface Group {
  area: string;
  fields: FieldMeta[];
}

interface Props {
  edition: string;
  editionLabel: string;
  editions: string[];
  sha: string;
  groups: Group[];
  pr: { number: number; url: string; title: string } | null;
  comment: { body: string; url: string; updatedAt: string } | null;
  branchUrl: string;
  fileUrl: string;
}

type Result =
  | { kind: "saved"; commitUrl: string; prUrl: string | null; count: number; inPlace: boolean }
  | { kind: "info" | "error"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "session"; message: string };

const BLANKABLE: TextKey[] = [
  "value", "display", "period", "period_label", "as_of", "year_ago", "year_ago_display", "year_ago_period", "change_pct", "change_points",
];

/** What the file holds after a save, as form strings (mirrors entryPatch's blank-means-keep rule). */
function savedCurrent(cur: FieldForm, f: FieldForm): FieldForm {
  const next: FieldForm = { ...cur, status: f.status, reason: f.status === "carry" ? f.reason.trim() : "" };
  for (const k of BLANKABLE) {
    if (f.status === "updated" || f[k].trim() !== "") next[k] = f[k].trim();
  }
  if (f.source_url.trim()) next.source_url = f.source_url.trim();
  return next;
}

const inputCls =
  "min-h-11 w-full rounded-md border bg-white px-3 py-2 text-base text-ink placeholder:text-[#9aa2ad] focus:outline-none focus:ring-2 sm:text-sm";
const okCls = "border-border focus:border-teal focus:ring-teal/30";
const badCls = "border-bad focus:border-bad focus:ring-bad/30";

const STATUS_TEXT: Record<Status, string> = {
  stale: "Needs update",
  updated: "Updated",
  carry: "Carried forward",
};
const STATUS_CLS: Record<Status, string> = {
  stale: "bg-[#fdf0e4] text-alert-amber",
  updated: "bg-good-bg text-good-text",
  carry: "bg-neutral-bg text-neutral",
};

export function AdminForm(props: Props) {
  const all = useMemo(() => props.groups.flatMap((g) => g.fields), [props.groups]);
  const [metas, setMetas] = useState<Record<string, FieldMeta>>(() => Object.fromEntries(all.map((m) => [m.id, m])));
  const [forms, setForms] = useState<Record<string, FieldForm>>(() => Object.fromEntries(all.map((m) => [m.id, initialForm(m)])));
  const [baseline, setBaseline] = useState(forms);
  const [errors, setErrors] = useState<Record<string, FieldErrors>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [sha, setSha] = useState(props.sha);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const dirtyIds = all.map((m) => m.id).filter((id) => JSON.stringify(forms[id]) !== JSON.stringify(baseline[id]));
  const dirty = dirtyIds.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const open = all.filter((m) => forms[m.id].status === "stale");
  const openRequired = open.filter((m) => m.required);

  function update(id: string, patch: Partial<FieldForm>) {
    const cur = forms[id];
    const next = { ...cur, ...patch };
    // Typing this month's number marks the field as updated.
    if (cur.status === "stale" && ["value", "period", "as_of", "year_ago"].some((k) => (patch as Record<string, string>)[k])) {
      next.status = "updated";
    }
    setForms((prev) => ({ ...prev, [id]: next }));
    setErrors((e) => ({ ...e, [id]: validateField(metas[id], next) }));
  }

  function blurPeriod(id: string) {
    touch(id, "period");
    const f = forms[id];
    const p = f.period.trim();
    if (!isPeriod(p)) return; // only suggest from a valid period
    const patch: Partial<FieldForm> = {};
    if (!f.period_label.trim()) patch.period_label = suggestLabel(p);
    if (!f.as_of.trim()) patch.as_of = p;
    if (!f.year_ago_period.trim()) patch.year_ago_period = yearEarlier(p);
    if (Object.values(patch).some(Boolean)) update(id, patch);
  }

  function touch(id: string, key: FieldKey) {
    setTouched((t) => new Set(t).add(`${id}.${key}`));
  }

  async function save() {
    setSubmitted(true);
    setResult(null);
    const errs: Record<string, FieldErrors> = {};
    for (const id of dirtyIds) {
      const e = validateField(metas[id], forms[id]);
      if (Object.keys(e).length) errs[id] = e;
    }
    setErrors((prev) => ({ ...prev, ...errs }));
    const bad = Object.keys(errs);
    if (bad.length) {
      setResult({ kind: "error", message: `${bad.length} field${bad.length === 1 ? " needs" : "s need"} attention (marked in red) before saving.` });
      document.getElementById(`f-${bad[0]}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!dirty) {
      setResult({ kind: "info", message: "Nothing has changed yet." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ edition: props.edition, sha, fields: Object.fromEntries(dirtyIds.map((id) => [id, forms[id]])) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.kind === "saved") {
        setSha(data.fileSha || sha);
        setMetas((prev) => {
          const next = { ...prev };
          for (const id of dirtyIds) next[id] = { ...prev[id], current: savedCurrent(prev[id].current, forms[id]) };
          return next;
        });
        setBaseline(forms);
        setResult({ kind: "saved", commitUrl: data.commitUrl, prUrl: data.prUrl ?? props.pr?.url ?? null, count: dirtyIds.length, inPlace: data.inPlace });
      } else if (res.ok) {
        setBaseline(forms);
        setResult({ kind: "info", message: data.message ?? "Nothing changed." });
      } else if (res.status === 409) {
        setResult({ kind: "conflict", message: data.message ?? "Someone else saved this file. Reload the page." });
      } else if (res.status === 401) {
        setResult({ kind: "session", message: data.message ?? "Your session has ended." });
      } else if (res.status === 422 && data.errors) {
        setErrors((prev) => ({ ...prev, ...data.errors }));
        setResult({ kind: "error", message: data.message ?? "Some fields need attention." });
      } else {
        setResult({ kind: "error", message: data.message ?? `Saving failed (${res.status}).` });
      }
    } catch {
      setResult({ kind: "error", message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-28">
      <section className="space-y-3 rounded-lg border border-border bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy">{props.editionLabel} numbers</h1>
            <p className="text-sm text-muted">
              Hand-entered figures for edition {props.edition}. Saving commits them to the review branch, then the site rebuilds and
              re-checks everything (about 3 minutes).
            </p>
          </div>
          {props.editions.length > 1 && (
            <div>
              <label htmlFor="edition" className="block text-[12px] font-semibold text-muted">
                Edition
              </label>
              <select
                id="edition"
                value={props.edition}
                onChange={(e) => {
                  if (!dirty || confirm("You have unsaved changes. Switch edition anyway?")) window.location.search = `?edition=${e.target.value}`;
                }}
                className="min-h-10 rounded-md border border-border bg-white px-2 text-sm"
              >
                {props.editions.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-sm">
          <strong className={open.length ? "text-alert-amber" : "text-good-text"}>
            {open.length ? `${open.length} of ${all.length} still need updating` : `All ${all.length} fields are updated or carried forward`}
          </strong>
          {openRequired.length > 0 && <span className="text-dark"> · {openRequired.length} of them required before publishing</span>}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <li>
            {props.pr ? (
              <a href={props.pr.url} target="_blank" rel="noopener noreferrer" className="source-link">
                Review pull request #{props.pr.number} ↗
              </a>
            ) : (
              <span className="text-muted">No open review pull request found</span>
            )}
          </li>
          <li>
            <a href={props.fileUrl} target="_blank" rel="noopener noreferrer" className="source-link">
              The file on GitHub ↗
            </a>
          </li>
        </ul>
        {props.comment && (
          <details className="rounded-md border border-border bg-panel p-3 text-sm">
            <summary className="cursor-pointer font-semibold text-ink">
              Latest validation report{" "}
              <span className="font-normal text-muted">(updated {new Date(props.comment.updatedAt).toLocaleString()})</span>
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto font-sans text-[13px] whitespace-pre-wrap text-dark">{props.comment.body}</pre>
            <a href={props.comment.url} target="_blank" rel="noopener noreferrer" className="source-link">
              Open on GitHub ↗
            </a>
          </details>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-teal" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Show only fields that still need updating
        </label>
      </section>

      {props.groups.map((g) => {
        const fields = g.fields.filter((m) => !onlyOpen || forms[m.id].status === "stale" || dirtyIds.includes(m.id));
        if (!fields.length) return null;
        return (
          <section key={g.area} aria-labelledby={`area-${g.area}`} className="space-y-3">
            <h2 id={`area-${g.area}`} className="border-b-2 border-navy pb-1 text-lg font-bold text-navy">
              {g.area}
            </h2>
            {fields.map((m) => (
              <FieldCard
                key={m.id}
                meta={metas[m.id]}
                form={forms[m.id]}
                errors={errors[m.id] ?? {}}
                show={(k) => submitted || touched.has(`${m.id}.${k}`)}
                onChange={(p) => update(m.id, p)}
                onBlur={(k) => (k === "period" ? blurPeriod(m.id) : touch(m.id, k))}
              />
            ))}
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <p className="text-sm text-dark" aria-live="polite">
            {saving ? "Saving…" : dirty ? `${dirtyIds.length} field${dirtyIds.length === 1 ? "" : "s"} changed, not saved yet` : "No unsaved changes"}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="min-h-11 rounded-md bg-teal px-5 py-2 text-base font-semibold text-white hover:bg-[#186574] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          role={result.kind === "saved" || result.kind === "info" ? "status" : "alert"}
          className={`fixed inset-x-4 bottom-20 z-30 mx-auto max-w-xl rounded-lg border-l-4 bg-white p-4 text-sm shadow-lg focus:outline-none sm:inset-x-6 ${
            result.kind === "saved" ? "border-good" : result.kind === "info" ? "border-teal" : "border-bad"
          }`}
        >
          <ResultBody result={result} />
          <button type="button" onClick={() => setResult(null)} className="mt-2 text-[13px] font-semibold text-muted underline">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function ResultBody({ result }: { result: Result }) {
  if (result.kind === "saved") {
    return (
      <>
        <p className="font-semibold text-good-text">
          Saved {result.count} field{result.count === 1 ? "" : "s"}.
        </p>
        <p className="mt-1 text-dark">
          The site is rebuilding and re-checking the edition now (about 3 minutes). The validation report on the pull request updates
          when it is done.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4">
          <a href={result.commitUrl} target="_blank" rel="noopener noreferrer" className="source-link">
            See the saved change ↗
          </a>
          {result.prUrl && (
            <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="source-link">
              Open the review pull request ↗
            </a>
          )}
        </p>
        {!result.inPlace && <p className="mt-1 text-[12px] text-muted">Note: the file was rewritten in standard layout; its per-entry comments were dropped.</p>}
      </>
    );
  }
  if (result.kind === "conflict") {
    return (
      <>
        <p className="font-semibold text-bad-text">Not saved: someone else saved this file after you opened it.</p>
        <p className="mt-1 text-dark">Note down anything you typed, then reload to get the latest version and enter it again.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded-md bg-navy px-3 py-1.5 font-semibold text-white">
          Reload
        </button>
      </>
    );
  }
  if (result.kind === "session") {
    return (
      <>
        <p className="font-semibold text-bad-text">Not saved: {result.message}</p>
        <p className="mt-1 text-dark">
          <a href="/admin/login" target="_blank" rel="noopener" className="source-link">
            Log in again in a new tab ↗
          </a>
          , then come back here and press Save again. Your typing is kept on this page.
        </p>
      </>
    );
  }
  return <p className={result.kind === "error" ? "font-semibold text-bad-text" : "text-dark"}>{result.message}</p>;
}

interface CardProps {
  meta: FieldMeta;
  form: FieldForm;
  errors: FieldErrors;
  show: (k: FieldKey) => boolean;
  onChange: (p: Partial<FieldForm>) => void;
  onBlur: (k: FieldKey) => void;
}

function FieldCard({ meta, form, errors, show, onChange, onBlur }: CardProps) {
  const cur = meta.current;
  const id = meta.id;
  const lastValue = cur.display || cur.value || "—";
  const lastPeriod = [cur.period_label, cur.period && `(${cur.period})`].filter(Boolean).join(" ");
  const visibleErrors = (Object.keys(errors) as FieldKey[]).filter((k) => show(k));
  const moreHasError = (["display", "year_ago_display", "change_pct", "change_points", "source_url"] as FieldKey[]).some((k) => visibleErrors.includes(k));

  const input = (key: FieldKey, label: string, opts: { hint?: string; placeholder?: string; required?: boolean; wide?: boolean } = {}) => {
    const err = show(key) ? errors[key] : undefined;
    const hintId = opts.hint ? `${id}-${key}-hint` : undefined;
    const errId = err ? `${id}-${key}-err` : undefined;
    return (
      <div className={opts.wide ? "col-span-2" : undefined}>
        <label htmlFor={`${id}-${key}`} className="block text-[13px] font-semibold text-ink">
          {label}
          {opts.required && form.status === "updated" && <span className="text-bad-text"> *</span>}
        </label>
        <input
          id={`${id}-${key}`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={form[key]}
          placeholder={opts.placeholder}
          onChange={(e) => onChange({ [key]: e.target.value } as Partial<FieldForm>)}
          onBlur={() => onBlur(key)}
          aria-invalid={err ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          className={`${inputCls} ${err ? badCls : okCls} mt-1`}
        />
        {opts.hint && (
          <p id={hintId} className="mt-0.5 text-[12px] text-muted">
            {opts.hint}
          </p>
        )}
        {err && (
          <p id={errId} className="mt-0.5 text-[12px] font-semibold text-bad-text">
            {err}
          </p>
        )}
      </div>
    );
  };

  return (
    <article id={`f-${id}`} className={`scroll-mt-4 rounded-lg border bg-white p-4 ${visibleErrors.length ? "border-bad" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-[16px] font-semibold text-ink">{meta.label}</h3>
        <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold uppercase">
          {meta.required && <span className="rounded border border-navy px-1.5 py-0.5 text-navy">Required</span>}
          <span className={`rounded px-1.5 py-0.5 ${STATUS_CLS[form.status]}`}>{STATUS_TEXT[form.status]}</span>
        </div>
      </div>
      <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-[13px] text-dark sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-muted">Last value</dt>
        <dd>
          {lastValue}
          {lastPeriod && <span className="text-muted"> · {lastPeriod}</span>}
          {cur.as_of && cur.as_of !== cur.period && <span className="text-muted"> · as of {cur.as_of}</span>}
        </dd>
        <dt className="font-semibold text-muted">Source</dt>
        <dd className="break-words">
          {cur.source_url ? (
            <a href={cur.source_url} target="_blank" rel="noopener noreferrer" className="source-link">
              Open the source ↗
            </a>
          ) : (
            "—"
          )}
        </dd>
        {meta.expected_release && (
          <>
            <dt className="font-semibold text-muted">Usually out</dt>
            <dd>{meta.expected_release}</dd>
          </>
        )}
        {(meta.notes || meta.footnote) && (
          <>
            <dt className="font-semibold text-muted">Notes</dt>
            <dd className="text-muted">{[meta.notes, meta.footnote].filter(Boolean).join(" ")}</dd>
          </>
        )}
      </dl>

      <fieldset className="mt-3">
        <legend className="text-[13px] font-semibold text-ink">Status</legend>
        <div className="mt-1 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-4">
          {(
            [
              ["stale", "Needs update"],
              ["updated", "Updated with the new number"],
              ["carry", "No new release: carry forward"],
            ] as [Status, string][]
          ).map(([s, text]) => (
            <label key={s} className="flex min-h-8 items-center gap-2 text-sm">
              <input type="radio" name={`${id}-status`} value={s} checked={form.status === s} onChange={() => onChange({ status: s })} className="h-4 w-4 accent-teal" />
              {text}
            </label>
          ))}
        </div>
      </fieldset>

      {form.status === "carry" && (
        <div className="mt-3">
          {input("reason", "Why is there no new number? (required)", {
            placeholder: "e.g. Publishes quarterly; next release Dec 4",
            wide: true,
          })}
          <p className="mt-0.5 text-[12px] text-muted">The site keeps showing the last value with its original “as of” date.</p>
        </div>
      )}

      {form.status !== "carry" && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {input("value", "New value", {
              required: true,
              placeholder: cur.value || undefined,
              hint: meta.unit ? `Plain number, ${UNIT_HINT[meta.unit] ?? meta.unit}` : "Plain number",
            })}
            {input("period", "Period covered", { required: true, placeholder: cur.period || "2026-11", hint: "e.g. 2026-11 or 2026-Q3" })}
            {input("period_label", "Short label", { required: true, placeholder: cur.period_label || "Nov", hint: "Shown on the page, e.g. Nov" })}
            {input("as_of", "As of", { required: true, placeholder: cur.as_of || "2026-11", hint: "Usually the same as the period" })}
            {input("year_ago", "Year-ago value", { placeholder: cur.year_ago || undefined, hint: "Leave blank if unknown (no arrow)" })}
            {input("year_ago_period", "Year-ago period", { placeholder: cur.year_ago_period || undefined, hint: "Same period, one year earlier" })}
          </div>
          <details className="mt-3 text-sm" open={moreHasError || undefined}>
            <summary className="cursor-pointer font-semibold text-teal">More options{meta.has_display ? " (display text)" : ""}</summary>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {meta.has_display &&
                input("display", "Display text", {
                  placeholder: cur.display || undefined,
                  hint: "Exact text on the page, e.g. 3.75–4.00%. Blank = standard format.",
                })}
              {meta.has_year_ago_display &&
                input("year_ago_display", "Year-ago display text", { placeholder: cur.year_ago_display || undefined, hint: "Blank = standard format" })}
              {meta.has_change_reported && input("change_pct", "Reported y/y change (%)", { placeholder: cur.change_pct || undefined, hint: "Only if the source gives no year-ago level" })}
              {meta.has_change_reported && input("change_points", "Reported y/y change (points)", { placeholder: cur.change_points || undefined })}
              {input("source_url", "Source web address", { wide: true, hint: "Change only if the source moved" })}
            </div>
          </details>
          <p className="mt-2 text-[12px] text-muted">Formats: {PERIOD_HINT}.</p>
        </>
      )}
    </article>
  );
}
