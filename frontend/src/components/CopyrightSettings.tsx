// src/components/CopyrightSettings.tsx
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  type CopyrightResponse,
  type CopyrightSection,
  type CopyrightSettings as Settings,
  useGetCopyrightQuery,
  usePreviewCopyrightMutation,
  useUpdateCopyrightMutation,
} from "../redux/api/authApiSlice";
import { Spinner } from "./ui";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  PenIcon,
  RefreshIcon,
  XIcon,
} from "./Icons";

// Matches the backend limits (COPYRIGHT_LIMITS, MAX_CUSTOM_WORDING)
const MAX_NOTICE = 1500;
const MAX_CUSTOM_WORDING = 800;

type TextField = "holder" | "publisher" | "contactEmail" | "website";

const FIELDS: {
  key: TextField;
  label: string;
  placeholder: string;
  hint: string;
  type?: string;
  maxLength: number;
}[] = [
  {
    key: "holder",
    label: "Copyright holder",
    placeholder: "e.g. Northgate Press LLC",
    hint: "Who owns the rights. Leave blank to use each book's author name.",
    maxLength: 120,
  },
  {
    key: "publisher",
    label: "Publisher / imprint",
    placeholder: "e.g. Northgate Press",
    hint: "Shown in the “Published by” line. Defaults to the holder.",
    maxLength: 120,
  },
  {
    key: "contactEmail",
    label: "Permissions email",
    placeholder: "e.g. rights@northgatepress.com",
    hint: "Where readers send permission requests.",
    type: "email",
    maxLength: 254,
  },
  {
    key: "website",
    label: "Website",
    placeholder: "e.g. northgatepress.com",
    hint: "Optional. Shown next to the email.",
    maxLength: 200,
  },
];

// How each placeholder reads in the option lists
const TOKEN_LABELS: Record<string, string> = {
  subject: "Case",
  year: String(new Date().getFullYear()),
  holder: "Holder",
  publisher: "Publisher",
  contact: "Contact",
};

/** Option text with its {placeholders} shown as chips */
const Template = ({ text }: { text: string }) => (
  <>
    {text.split(/(\{\w+\})/).map((part, i) => {
      const token = part.match(/^\{(\w+)\}$/)?.[1];
      return token && TOKEN_LABELS[token] ? (
        <span
          key={i}
          className="mx-0.5 rounded bg-brand-50 px-1.5 py-0.5 font-sans text-[0.8em] font-semibold text-brand-700"
        >
          {TOKEN_LABELS[token]}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      );
    })}
  </>
);

/** Drops blanks so "changed?" ignores whitespace-only edits */
const tidy = (settings: Settings): Settings => {
  const result: Settings = {};
  for (const key of [...FIELDS.map((f) => f.key), "customNotice"] as const) {
    const value = settings[key]?.trim();
    if (value) result[key] = value;
  }
  const wording = Object.fromEntries(
    Object.entries(settings.wording ?? {})
      .map(([key, choice]) => [key, typeof choice === "string" ? choice.trim() : choice])
      .filter(([, choice]) => choice !== ""),
  );
  if (Object.keys(wording).length) result.wording = wording;
  return result;
};

// The page's parts in reading order, grouped the way they appear
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Opening", keys: ["rights", "reproduction", "contact", "noContact"] },
  { title: "Independence", keys: ["independenceHeading", "independence", "legalNotice"] },
  { title: "Sources", keys: ["sourcesHeading", "sources", "trademarks"] },
  { title: "License", keys: ["licenseHeading", "license"] },
  { title: "Closing", keys: ["edition", "publishedBy"] },
];

const isHeading = (key: string) => key.endsWith("Heading");

const WordingBlock = ({
  section,
  choice,
  defaultIndex,
  onChange,
}: {
  section: CopyrightSection;
  choice: number | string | undefined;
  defaultIndex: number;
  onChange: (choice: number | string | undefined) => void;
}) => {
  const [showAll, setShowAll] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const total = section.options.length;
  const custom = typeof choice === "string" ? choice : null;
  const selected = custom === null ? (choice as number | undefined) ?? defaultIndex : -1;
  const heading = isHeading(section.key);

  const step = (direction: number) => {
    const from = selected === -1 ? (direction > 0 ? -1 : 0) : selected;
    onChange((from + direction + total) % total);
  };

  // Put the placeholder where the cursor is, not at the end
  const insertToken = (token: string) => {
    const el = textareaRef.current;
    const text = custom ?? "";
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    const next = `${text.slice(0, at)}{${token}}${text.slice(end)}`;
    onChange(next.slice(0, MAX_CUSTOM_WORDING));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length + 2, at + token.length + 2);
    });
  };

  return (
    <li className="group px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
            {section.label}
            {custom !== null ? (
              <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] tracking-wide text-accent-600 uppercase">
                Your words
              </span>
            ) : (
              selected === defaultIndex && (
                <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] tracking-wide uppercase ring-1 ring-line">
                  Default
                </span>
              )
            )}
          </span>
        </span>

        {/* Flip through the options without opening the list */}
        <div className="flex shrink-0 items-center rounded-full ring-1 ring-line">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={`Previous ${section.label} option`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
          >
            <ChevronLeftIcon size={16} />
          </button>
          <span className="w-11 text-center text-xs font-semibold text-ink tabular-nums">
            {custom !== null ? "—" : `${selected + 1}/${total}`}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={`Next ${section.label} option`}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-paper hover:text-ink"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={() =>
            custom === null
              ? onChange(section.options[selected] ?? "")
              : onChange(undefined)
          }
          aria-label={custom === null ? `Write your own ${section.label}` : "Back to options"}
          title={custom === null ? "Write my own" : "Back to options"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition ${
            custom !== null
              ? "bg-accent-50 text-accent-600 ring-accent-100"
              : "text-muted ring-line hover:bg-paper hover:text-ink"
          }`}
        >
          {custom === null ? <PenIcon size={14} /> : <XIcon size={14} />}
        </button>
      </div>

      {custom !== null ? (
        <div className="mt-3">
          <textarea
            ref={textareaRef}
            rows={heading || section.options[0].length < 80 ? 2 : 4}
            maxLength={MAX_CUSTOM_WORDING}
            value={custom}
            onChange={(e) => onChange(e.target.value)}
            className="input resize-y font-serif"
            aria-label={`${section.label}: your own words`}
            autoFocus
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Insert:</span>
            {Object.entries(TOKEN_LABELS).map(([token, label]) => (
              <button
                key={token}
                type="button"
                onClick={() => insertToken(token)}
                className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p
          className={`mt-2 text-ink ${
            heading
              ? "font-sans text-sm font-bold tracking-[0.12em] uppercase"
              : "font-serif text-[0.95rem] leading-relaxed"
          }`}
        >
          <Template text={section.options[selected]} />
        </p>
      )}

      {custom === null && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          {showAll ? "Hide options" : `See all ${total} options`}
          <ChevronDownIcon size={14} className={`transition ${showAll ? "rotate-180" : ""}`} />
        </button>
      )}

      {custom === null && showAll && (
        <ul className="mt-3 space-y-1.5" role="radiogroup" aria-label={section.label}>
          {section.options.map((option, index) => {
            const active = index === selected;
            return (
              <li key={index}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(index)}
                  className={`flex w-full gap-3 rounded-lg border p-3 text-left text-sm leading-relaxed transition ${
                    active
                      ? "border-brand-500 bg-brand-50"
                      : "border-line bg-white hover:border-ink/20"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      active ? "bg-brand-600 text-white" : "ring-1 ring-line"
                    }`}
                  >
                    {active ? (
                      <CheckIcon size={12} strokeWidth={3} />
                    ) : (
                      <span className="text-[10px] font-bold text-muted">{index + 1}</span>
                    )}
                  </span>
                  <span className={heading ? "font-semibold tracking-wide uppercase" : "font-serif"}>
                    <Template text={option} />
                    {index === defaultIndex && (
                      <span className="ml-2 font-sans text-[10px] font-semibold tracking-wide text-muted uppercase">
                        Default
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
};

const CopyrightForm = ({ data }: { data: CopyrightResponse }) => {
  const [form, setForm] = useState<Settings>(data.settings);
  const [tab, setTab] = useState<"details" | "wording">("details");
  const [updateCopyright, { isLoading: saving }] = useUpdateCopyrightMutation();
  const [previewCopyright, { data: livePreview, isLoading: previewing }] =
    usePreviewCopyrightMutation();

  const draft = tidy(form);
  const draftKey = JSON.stringify(draft);
  const changed = draftKey !== JSON.stringify(tidy(data.settings));
  const hasContact = !!(draft.contactEmail || draft.website);
  const customized = Object.keys(draft.wording ?? {}).length;

  // Re-render the page shortly after the last edit
  useEffect(() => {
    if (!changed) return;
    const timer = setTimeout(() => previewCopyright(JSON.parse(draftKey)), 350);
    return () => clearTimeout(timer);
  }, [draftKey, changed, previewCopyright]);

  const preview = changed && livePreview ? livePreview.preview : data.preview;

  const sectionByKey = new Map(data.sections.map((s) => [s.key, s]));
  // Only the permissions line the page will actually use
  const hidden = hasContact ? "noContact" : "contact";
  const grouped = GROUPS.map((group) => ({
    ...group,
    sections: group.keys
      .filter((key) => key !== hidden)
      .map((key) => sectionByKey.get(key))
      .filter((s): s is CopyrightSection => !!s),
  }));
  // Anything the server adds later still gets shown
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const extra = data.sections.filter((s) => !known.has(s.key));
  if (extra.length) grouped.push({ title: "Other", keys: [], sections: extra });

  const setChoice = (key: string, choice: number | string | undefined) => {
    setForm((prev) => {
      const wording = { ...prev.wording };
      if (choice === undefined) delete wording[key];
      else wording[key] = choice;
      return { ...prev, wording };
    });
  };

  const shuffle = () =>
    setForm((prev) => ({
      ...prev,
      wording: Object.fromEntries(
        data.sections.map((s) => [s.key, Math.floor(Math.random() * s.options.length)]),
      ),
    }));

  const resetWording = () => setForm((prev) => ({ ...prev, wording: {} }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateCopyright(draft).unwrap();
      toast.success("Copyright page saved. It applies to books you create from now on.");
    } catch (err) {
      const message = (err as { data?: { message?: string | string[] } })?.data
        ?.message;
      toast.error(Array.isArray(message) ? message[0] : message || "Couldn't save");
    }
  };

  const tabs = [
    { id: "details" as const, label: "Details" },
    {
      id: "wording" as const,
      label: "Wording",
      badge: customized ? `${customized} changed` : undefined,
    },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div className="min-w-0">
        <div role="tablist" className="mb-6 inline-flex rounded-full bg-paper p-1 ring-1 ring-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                tab === t.id ? "bg-white text-ink shadow-soft" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] text-accent-600">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "details" ? (
          <div className="space-y-5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <label htmlFor={`copyright-${field.key}`} className="label">
                  {field.label}
                </label>
                <input
                  id={`copyright-${field.key}`}
                  type={field.type || "text"}
                  maxLength={field.maxLength}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                  className="input"
                  placeholder={field.placeholder}
                />
                <p className="hint">{field.hint}</p>
              </div>
            ))}
            <div>
              <label htmlFor="copyright-customNotice" className="label">
                Extra notice <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="copyright-customNotice"
                rows={3}
                maxLength={MAX_NOTICE}
                value={form.customNotice ?? ""}
                onChange={(e) => setForm({ ...form, customNotice: e.target.value })}
                className="input resize-y"
                placeholder="e.g. Cover design by Studio North. ISBN available on request."
              />
              <div className="hint flex justify-between gap-4">
                <span>Added after the standard notices on every book.</span>
                <span className="shrink-0 tabular-nums">
                  {(form.customNotice ?? "").length}/{MAX_NOTICE}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Use the arrows to try other wording, or{" "}
                <PenIcon size={13} className="inline -translate-y-px" /> to write
                your own.
              </p>
              <div className="flex gap-1">
                <button type="button" onClick={shuffle} className="btn-ghost px-3 py-1.5">
                  <RefreshIcon size={14} />
                  Shuffle
                </button>
                <button
                  type="button"
                  onClick={resetWording}
                  disabled={customized === 0}
                  className="btn-ghost px-3 py-1.5"
                >
                  Reset
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {grouped.map((group) => (
                <section key={group.title}>
                  <h3 className="mb-2 font-sans text-xs font-semibold tracking-[0.16em] text-accent-600 uppercase">
                    {group.title}
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                    {group.sections.map((section) => (
                      <WordingBlock
                        key={section.key}
                        section={section}
                        choice={form.wording?.[section.key]}
                        defaultIndex={data.defaults[section.key] ?? 0}
                        onChange={(choice) => setChoice(section.key, choice)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <button type="submit" disabled={saving || !changed} className="btn-primary btn-lg w-full sm:w-auto">
            {saving ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving...
              </>
            ) : (
              "Save copyright page"
            )}
          </button>
          {changed && (
            <button
              type="button"
              onClick={() => setForm(data.settings)}
              className="btn-secondary btn-lg w-full sm:w-auto"
            >
              Discard changes
            </button>
          )}
        </div>
      </div>

      <div className="min-w-0 lg:sticky lg:top-24">
        <p className="label flex items-center gap-2">
          Preview
          {changed && (
            <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-600">
              Unsaved
            </span>
          )}
          {previewing && <Spinner className="h-3.5 w-3.5 text-muted" />}
        </p>
        <div className="max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-paper p-4 font-serif text-sm leading-relaxed break-words whitespace-pre-line text-ink sm:p-5">
          {preview}
        </div>
        <p className="hint">
          The bracketed parts are filled in for each book. Parts you don't
          change use wording unique to your account.
        </p>
      </div>
    </form>
  );
};

const CopyrightSettings = () => {
  const { data, isLoading, isError } = useGetCopyrightQuery();

  return (
    <section className="card mt-6 px-4 py-6 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper text-muted ring-1 ring-line">
          <FileTextIcon size={18} />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Copyright page</h2>
          <p className="mt-0.5 text-sm text-muted">
            Your account's own copyright page, used at the front of every book you
            create. Books already made keep their current page.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-accent-600">Couldn't load your copyright settings.</p>
      ) : (
        // Remount after a save so the form starts from the stored values
        <CopyrightForm key={JSON.stringify(data.settings)} data={data} />
      )}
    </section>
  );
};

export default CopyrightSettings;
