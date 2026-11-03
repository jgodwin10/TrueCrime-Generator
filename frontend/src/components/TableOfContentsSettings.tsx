// src/components/TableOfContentsSettings.tsx
import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  type TableOfContentsKey,
  type TableOfContentsResponse,
  type TableOfContentsSection,
  type TableOfContentsSettings as Settings,
  useGetTableOfContentsQuery,
  usePreviewTableOfContentsMutation,
  useUpdateTableOfContentsMutation,
} from "../redux/api/authApiSlice";
import { Spinner } from "./ui";
import {
  CheckIcon,
  ChevronDownIcon,
  ListIcon,
  PenIcon,
  RefreshIcon,
  XIcon,
} from "./Icons";

// Matches the backend limits (MAX_CUSTOM_HEADING, MAX_CUSTOM_ENTRY)
const MAX_LENGTH: Partial<Record<TableOfContentsKey, number>> = {
  heading: 60,
  entry: 80,
};

// Entry placeholders, with how chapter 1 reads in the option lists
const TOKENS: { token: string; label: string; example: string }[] = [
  { token: "n", label: "Number", example: "1" },
  { token: "word", label: "Number in words", example: "One" },
  { token: "ordinal", label: "Ordinal", example: "First" },
  { token: "roman", label: "Roman numeral", example: "I" },
  { token: "title", label: "Title", example: "Beginnings" },
];

// Options shown before "See all"
const COLLAPSED_COUNT = 6;

const fillEntry = (pattern: string) =>
  pattern.replace(/\{(\w+)\}/g, (match, name) => {
    return TOKENS.find((t) => t.token === name)?.example ?? match;
  });

/** Trims own text and drops blanks so "changed?" ignores whitespace */
const tidy = (settings: Settings): Settings => {
  const result: Settings = {};
  for (const [key, choice] of Object.entries(settings) as [
    TableOfContentsKey,
    number | string | undefined,
  ][]) {
    const value = typeof choice === "string" ? choice.replace(/\s+/g, " ").trim() : choice;
    if (value !== undefined && value !== "") (result as Record<string, unknown>)[key] = value;
  }
  return result;
};

/** Reads the preview text: heading, then entries indented by level */
const parsePreview = (text: string) => {
  const [heading = "", ...rest] = text.split("\n").filter((line) => line.trim());
  return {
    heading,
    lines: rest.map((line) => ({
      text: line.trim(),
      level: line.startsWith("    ") ? 2 : line.startsWith("  ") ? 1 : 0,
    })),
  };
};

const ContentsPage = ({ text }: { text: string }) => {
  const { heading, lines } = parsePreview(text);
  return (
    <div className="rounded-xl border border-line bg-paper px-6 py-7 font-serif text-ink">
      <p className="text-center font-sans text-sm font-bold tracking-[0.14em] uppercase">
        {heading}
      </p>
      <ol className="mt-5 space-y-1">
        {lines.map((line, i) => (
          <li
            key={i}
            className={
              line.level === 0
                ? `font-semibold ${i > 0 ? "pt-2.5" : ""}`
                : line.level === 1
                  ? "pl-4 text-sm text-ink/80"
                  : "pl-8 text-xs text-muted"
            }
          >
            {line.text}
          </li>
        ))}
      </ol>
    </div>
  );
};

const Badge = ({ children, tone }: { children: string; tone: "default" | "own" }) => (
  <span
    className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wide uppercase ${
      tone === "own" ? "bg-accent-50 text-accent-600" : "bg-paper text-muted ring-1 ring-line"
    }`}
  >
    {children}
  </span>
);

/** Heading or entry: pick an option, or write your own */
const OptionPicker = ({
  section,
  choice,
  defaultIndex,
  onChange,
}: {
  section: TableOfContentsSection;
  choice: number | string | undefined;
  defaultIndex: number;
  onChange: (choice: number | string | undefined) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const isEntry = section.key === "entry";
  const maxLength = MAX_LENGTH[section.key] ?? 80;
  const custom = typeof choice === "string" ? choice : null;
  const selected = custom === null ? (choice ?? defaultIndex) : -1;
  const missingTitle = isEntry && custom !== null && !custom.includes("{title}");

  // Put the placeholder where the cursor is, not at the end
  const insertToken = (token: string) => {
    const el = inputRef.current;
    const text = custom ?? "";
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    onChange(`${text.slice(0, at)}{${token}}${text.slice(end)}`.slice(0, maxLength));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length + 2, at + token.length + 2);
    });
  };

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={section.label}>
        {section.options.map((option, index) => {
          const active = index === selected;
          // Collapsed, keep the chosen and default options in view
          if (
            !showAll &&
            index >= COLLAPSED_COUNT &&
            !active &&
            index !== defaultIndex
          ) {
            return null;
          }
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(index)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                active ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:border-ink/20"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  active ? "bg-brand-600 text-white" : "ring-1 ring-line"
                }`}
              >
                {active && <CheckIcon size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 font-serif">
                {isEntry ? fillEntry(option) : option}
              </span>
              {index === defaultIndex && <Badge tone="default">Default</Badge>}
            </button>
          );
        })}

        <button
          type="button"
          role="radio"
          aria-checked={custom !== null}
          onClick={() => {
            if (custom === null) {
              onChange(section.options[selected as number] ?? "");
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
          className={`flex items-center gap-3 rounded-lg border border-dashed p-3 text-left text-sm font-semibold transition ${
            custom !== null
              ? "border-accent-500 bg-accent-50 text-accent-600"
              : "border-line text-muted hover:border-ink/20 hover:text-ink"
          }`}
        >
          <PenIcon size={16} />
          Write my own
        </button>
      </div>

      {section.options.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          {showAll ? "Show fewer" : `See all ${section.options.length} options`}
          <ChevronDownIcon size={14} className={`transition ${showAll ? "rotate-180" : ""}`} />
        </button>
      )}

      {custom !== null && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              maxLength={maxLength}
              value={custom}
              onChange={(e) => onChange(e.target.value)}
              className="input font-serif"
              aria-label={`${section.label}: your own`}
              aria-invalid={missingTitle}
            />
            <button
              type="button"
              onClick={() => onChange(undefined)}
              aria-label="Back to options"
              title="Back to options"
              className="btn-ghost shrink-0 px-3"
            >
              <XIcon size={16} />
            </button>
          </div>

          {isEntry && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted">Insert:</span>
                {TOKENS.map(({ token, label }) => (
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
              {missingTitle ? (
                <p className="hint text-accent-600">
                  Add the Title placeholder, or every chapter would read the same.
                </p>
              ) : (
                <p className="hint">
                  Chapter 1 reads: <span className="font-serif text-ink">{fillEntry(custom)}</span>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** Detail: how deep the list goes */
const DetailPicker = ({
  section,
  choice,
  defaultIndex,
  onChange,
}: {
  section: TableOfContentsSection;
  choice: number | string | undefined;
  defaultIndex: number;
  onChange: (choice: number) => void;
}) => {
  const selected = typeof choice === "number" ? choice : defaultIndex;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={section.label}>
      {section.options.map((option, index) => {
        const active = index === selected;
        return (
          <button
            key={index}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(index)}
            className={`flex flex-col gap-2 rounded-lg border p-3 text-left text-sm transition ${
              active ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:border-ink/20"
            }`}
          >
            {/* A small sketch of how deep the list goes */}
            <span className="flex flex-col gap-1" aria-hidden="true">
              {[0, 1, 2].map((level) => (
                <span
                  key={level}
                  className={`h-1.5 rounded-full ${
                    level <= index
                      ? active
                        ? "bg-brand-500"
                        : "bg-ink/25"
                      : "bg-transparent"
                  }`}
                  style={{ marginLeft: `${level * 12}px`, width: `${70 - level * 15}%` }}
                />
              ))}
            </span>
            <span className="font-semibold text-ink">{option}</span>
            {index === defaultIndex && (
              <span className="self-start">
                <Badge tone="default">Default</Badge>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

const TableOfContentsForm = ({ data }: { data: TableOfContentsResponse }) => {
  const [form, setForm] = useState<Settings>(data.settings);
  const [updateTableOfContents, { isLoading: saving }] = useUpdateTableOfContentsMutation();
  const [previewTableOfContents, { data: livePreview, isLoading: previewing }] =
    usePreviewTableOfContentsMutation();

  const draft = tidy(form);
  const draftKey = JSON.stringify(draft);
  const changed = draftKey !== JSON.stringify(tidy(data.settings));
  const invalid =
    (typeof draft.entry === "string" && !draft.entry.includes("{title}")) ||
    // "Write my own" with nothing written yet
    Object.entries(form).some(([, choice]) => typeof choice === "string" && !choice.trim());

  // Re-render the page shortly after the last edit
  useEffect(() => {
    if (!changed || invalid) return;
    const timer = setTimeout(() => previewTableOfContents(JSON.parse(draftKey)), 300);
    return () => clearTimeout(timer);
  }, [draftKey, changed, invalid, previewTableOfContents]);

  const preview = changed && livePreview ? livePreview.preview : data.preview;

  const setChoice = (key: TableOfContentsKey, choice: number | string | undefined) =>
    setForm((prev) => {
      const next = { ...prev };
      if (choice === undefined) delete next[key];
      else (next as Record<string, unknown>)[key] = choice;
      return next;
    });

  const shuffle = () =>
    setForm(
      Object.fromEntries(
        data.sections.map((s) => [s.key, Math.floor(Math.random() * s.options.length)]),
      ),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    try {
      await updateTableOfContents(draft).unwrap();
      toast.success("Contents format saved. It applies to books you create from now on.");
    } catch (err) {
      const message = (err as { data?: { message?: string | string[] } })?.data?.message;
      toast.error(Array.isArray(message) ? message[0] : message || "Couldn't save");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Choose each part, or{" "}
            <PenIcon size={13} className="inline -translate-y-px" /> write your own.
          </p>
          <div className="flex gap-1">
            <button type="button" onClick={shuffle} className="btn-ghost px-3 py-1.5">
              <RefreshIcon size={14} />
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => setForm({})}
              disabled={Object.keys(draft).length === 0}
              className="btn-ghost px-3 py-1.5"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="space-y-7">
          {data.sections.map((section) => (
            <section key={section.key}>
              <h3 className="flex items-center gap-2 font-sans text-xs font-semibold tracking-[0.16em] text-accent-600 uppercase">
                {section.label}
                {typeof form[section.key] === "string" && <Badge tone="own">Your own</Badge>}
              </h3>
              <p className="mt-1 mb-3 text-sm text-muted">{section.description}</p>
              {section.custom ? (
                <OptionPicker
                  section={section}
                  choice={form[section.key]}
                  defaultIndex={data.defaults[section.key] ?? 0}
                  onChange={(choice) => setChoice(section.key, choice)}
                />
              ) : (
                <DetailPicker
                  section={section}
                  choice={form[section.key]}
                  defaultIndex={data.defaults[section.key] ?? 0}
                  onChange={(choice) => setChoice(section.key, choice)}
                />
              )}
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <button
            type="submit"
            disabled={saving || !changed || invalid}
            className="btn-primary btn-lg w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving...
              </>
            ) : (
              "Save contents format"
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
        <ContentsPage text={preview} />
        <p className="hint">
          A sample outline. Each book lists its own chapters. Parts you don't
          choose use a format unique to your account.
        </p>
      </div>
    </form>
  );
};

const TableOfContentsSettings = () => {
  const { data, isLoading, isError } = useGetTableOfContentsQuery();

  return (
    <section className="card mt-6 px-4 py-6 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper text-muted ring-1 ring-line">
          <ListIcon size={18} />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Table of contents</h2>
          <p className="mt-0.5 text-sm text-muted">
            How the contents page of every book you create is laid out. Books
            already made keep their current page.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-accent-600">Couldn't load your contents format.</p>
      ) : (
        // Remount after a save so the form starts from the stored values
        <TableOfContentsForm key={JSON.stringify(data.settings)} data={data} />
      )}
    </section>
  );
};

export default TableOfContentsSettings;
