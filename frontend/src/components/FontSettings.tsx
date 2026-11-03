// src/components/FontSettings.tsx
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  type FontOption,
  type FontRole,
  type FontSection,
  type FontSettings as Settings,
  type FontsResponse,
  useGetFontsQuery,
  useUpdateFontsMutation,
} from "../redux/api/authApiSlice";
import { Spinner } from "./ui";
import { CheckIcon, ChevronDownIcon, RefreshIcon, TypeIcon } from "./Icons";

// Options shown before "See all"
const COLLAPSED_COUNT = 6;

const SAMPLE: Record<FontRole, string> = {
  heading: "Chapter One",
  body: "The years passed slowly, then all at once.",
};

const fallback = (option?: FontOption) =>
  option?.category === "sans" ? "ui-sans-serif, sans-serif" : "Georgia, serif";

const fontStack = (option?: FontOption) =>
  option ? `"${option.family}", ${fallback(option)}` : undefined;

/**
 * Loads every offered font from Google Fonts (the same files the books
 * embed) so each option previews in its own face. Body fonts also get
 * italics for the sample page.
 */
const useOptionFonts = (sections: FontSection[]) => {
  useEffect(() => {
    const italic = new Set(
      sections.find((s) => s.key === "body")?.options.map((o) => o.family),
    );
    const families = [
      ...new Set(sections.flatMap((s) => s.options.map((o) => o.family))),
    ];
    const query = families
      .map(
        (family) =>
          `family=${family.replace(/ /g, "+")}:${
            italic.has(family) ? "ital,wght@0,400;0,700;1,400" : "wght@400;700"
          }`,
      )
      .join("&");
    const href = `https://fonts.googleapis.com/css2?${query}&display=swap`;
    if (document.querySelector(`link[href="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [sections]);
};

const FontPicker = ({
  section,
  choice,
  defaultId,
  onChange,
}: {
  section: FontSection;
  choice: string | undefined;
  defaultId: string;
  onChange: (id: string) => void;
}) => {
  const [showAll, setShowAll] = useState(false);
  const selected = choice ?? defaultId;
  const heading = section.key === "heading";

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={section.label}>
        {section.options.map((option, index) => {
          const active = option.id === selected;
          // Collapsed, keep the chosen and default fonts in view
          if (!showAll && index >= COLLAPSED_COUNT && !active && option.id !== defaultId) {
            return null;
          }
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.id)}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                active ? "border-brand-500 bg-brand-50" : "border-line bg-white hover:border-ink/20"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  active ? "bg-brand-600 text-white" : "ring-1 ring-line"
                }`}
              >
                {active && <CheckIcon size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
                  {option.family}
                  {option.id === defaultId && (
                    <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] tracking-wide uppercase ring-1 ring-line">
                      Default
                    </span>
                  )}
                </span>
                <span
                  className={`mt-1 block truncate text-ink ${
                    heading ? "text-xl font-bold" : "text-[0.95rem]"
                  }`}
                  style={{ fontFamily: fontStack(option) }}
                >
                  {SAMPLE[section.key]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {section.options.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          {showAll ? "Show fewer" : `See all ${section.options.length} fonts`}
          <ChevronDownIcon size={14} className={`transition ${showAll ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
};

/** A chapter opening set in the chosen fonts */
const SamplePage = ({ heading, body }: { heading?: FontOption; body?: FontOption }) => (
  <div className="rounded-xl border border-line bg-paper px-6 py-7 text-ink">
    <div style={{ fontFamily: fontStack(heading) }} className="text-center">
      <p className="text-xs font-bold tracking-[0.14em] uppercase">Chapter 1</p>
      <p className="mt-1 text-2xl font-bold">Beginnings</p>
    </div>
    <div style={{ fontFamily: fontStack(body) }} className="mt-5 space-y-3 text-sm leading-relaxed">
      <p>
        The first call came in from a small town by the river, shortly
        before seven, about a car parked in the wrong place.
      </p>
      <p>
        The report was almost filed and forgotten. <em>Nothing</em> about it hinted
        at what was to come — or at the <strong>questions</strong> still open today.
      </p>
    </div>
  </div>
);

const FontForm = ({ data }: { data: FontsResponse }) => {
  const [form, setForm] = useState<Settings>(data.settings);
  const [updateFonts, { isLoading: saving }] = useUpdateFontsMutation();
  useOptionFonts(data.sections);

  // Per role: the stored settings may list them in another order
  const changed = data.sections.some((s) => form[s.key] !== data.settings[s.key]);

  const optionFor = (role: FontRole) => {
    const id = form[role] ?? data.defaults[role];
    return data.sections.find((s) => s.key === role)?.options.find((o) => o.id === id);
  };

  const shuffle = () =>
    setForm(
      Object.fromEntries(
        data.sections.map((s) => [
          s.key,
          s.options[Math.floor(Math.random() * s.options.length)].id,
        ]),
      ),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateFonts(form).unwrap();
      toast.success("Fonts saved. They apply to books you create from now on.");
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
          <p className="text-sm text-muted">Pick a font for headings and one for the text.</p>
          <div className="flex gap-1">
            <button type="button" onClick={shuffle} className="btn-ghost px-3 py-1.5">
              <RefreshIcon size={14} />
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => setForm({})}
              disabled={Object.keys(form).length === 0}
              className="btn-ghost px-3 py-1.5"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="space-y-7">
          {data.sections.map((section) => (
            <section key={section.key}>
              <h3 className="font-sans text-xs font-semibold tracking-[0.16em] text-accent-600 uppercase">
                {section.label}
              </h3>
              <p className="mt-1 mb-3 text-sm text-muted">{section.description}</p>
              <FontPicker
                section={section}
                choice={form[section.key]}
                defaultId={data.defaults[section.key]}
                onChange={(id) => setForm((prev) => ({ ...prev, [section.key]: id }))}
              />
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-6">
          <button type="submit" disabled={saving || !changed} className="btn-primary btn-lg w-full sm:w-auto">
            {saving ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving...
              </>
            ) : (
              "Save fonts"
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
        </p>
        <SamplePage heading={optionFor("heading")} body={optionFor("body")} />
        <p className="hint">
          Used in your PDF, EPUB and Word files. Fonts you don't choose use
          ones picked for your account.
        </p>
      </div>
    </form>
  );
};

const FontSettings = () => {
  const { data, isLoading, isError } = useGetFontsQuery();

  return (
    <section className="card mt-6 px-4 py-6 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper text-muted ring-1 ring-line">
          <TypeIcon size={18} />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Fonts</h2>
          <p className="mt-0.5 text-sm text-muted">
            The typefaces of every book you create. Books already made keep
            their current fonts.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 text-brand-600">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-accent-600">Couldn't load your fonts.</p>
      ) : (
        // Remount after a save so the form starts from the stored values
        <FontForm key={JSON.stringify(data.settings)} data={data} />
      )}
    </section>
  );
};

export default FontSettings;
