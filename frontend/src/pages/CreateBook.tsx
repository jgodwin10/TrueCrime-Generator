// src/pages/CreateBook.tsx
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { type RootState } from "../redux/store";
import { useGenerateBookMutation } from "../redux/api/booksApiSlice";
import { BookCover, Spinner, StateMessage } from "../components/ui";
import {
  AlertCircleIcon,
  CheckIcon,
  ImageIcon,
  SparklesIcon,
  UploadIcon,
  XIcon,
} from "../components/Icons";

interface ImagePreview {
  file: File;
  preview: string;
}

// Matches the backend upload limit (FileFieldsInterceptor maxCount)
const MAX_IMAGES = 20;
// Matches the backend notes limit (CreateBookDto @MaxLength)
const MAX_NOTES = 4000;
// Matches the backend chapter limits (CreateBookDto @Min/@Max)
const MIN_CHAPTERS = 5;
const MAX_CHAPTERS = 30;
const DEFAULT_CHAPTERS = 12;

const Section = ({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="card p-5 sm:p-8">
    <div className="mb-6 flex items-start gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
        {step}
      </span>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
    </div>
    {children}
  </section>
);

const DropZone = ({
  id,
  multiple,
  onFiles,
  icon,
  title,
  hint,
}: {
  id: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  icon: ReactNode;
  title: string;
  hint: string;
}) => {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
        dragging
          ? "border-brand-500 bg-brand-50"
          : "border-line bg-paper/60 hover:border-brand-200 hover:bg-brand-50/50"
      }`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-soft">
        {icon}
      </span>
      <span className="mt-4 font-semibold">{title}</span>
      <span className="mt-1 text-sm text-muted">{hint}</span>
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          // Allow re-selecting the same file after removing it
          e.target.value = "";
        }}
      />
    </label>
  );
};

const RemoveButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 text-white backdrop-blur transition hover:bg-accent-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
  >
    <XIcon size={16} strokeWidth={2.25} />
  </button>
);

const CreateBook = () => {
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const [generateBook, { isLoading }] = useGenerateBookMutation();

  const [formData, setFormData] = useState({
    subject: "",
    notes: "",
    title: "",
    subtitle: "",
    author: "",
    numberOfChapters: DEFAULT_CHAPTERS,
  });

  const [images, setImages] = useState<ImagePreview[]>([]);

  const addImages = (files: File[]) => {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.info(`You can add up to ${MAX_IMAGES} photos`);
      return;
    }
    if (files.length > room) {
      toast.info(`Only the first ${room} photos were added (max ${MAX_IMAGES})`);
    }
    const previews = files.slice(0, room).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setImages((prev) => [...prev, ...previews]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      // Revoke the URL to free memory
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error("You must be logged in to create a book");
      navigate("/login");
      return;
    }

    if (!formData.subject.trim() || !formData.title || !formData.author) {
      toast.error("Subject, title and author are required");
      return;
    }

    const fd = new FormData();
    fd.append("subject", formData.subject.trim());
    fd.append("title", formData.title);
    fd.append("subtitle", formData.subtitle);
    fd.append("author", formData.author);
    fd.append("numberOfChapters", String(formData.numberOfChapters));
    if (formData.notes.trim()) fd.append("notes", formData.notes.trim());
    fd.append("userId", user.id);

    images.forEach((img) => fd.append("images", img.file));

    try {
      const res = await generateBook(fd).unwrap();
      toast.success("Book generation started! This will take 10-15 minutes.");

      // Clean up preview URLs
      images.forEach((img) => URL.revokeObjectURL(img.preview));

      navigate(`/status/${res.projectId}`);
    } catch (err: any) {
      console.error("Book generation error:", err);
      toast.error(err?.data?.message || "Generation failed");
    }
  };

  if (!user) {
    return (
      <StateMessage
        icon={<AlertCircleIcon size={26} />}
        tone="error"
        title="Please sign in"
        action={
          <button onClick={() => navigate("/login")} className="btn-primary btn-lg w-full">
            Go to login
          </button>
        }
      >
        You need an account to create a book.
      </StateMessage>
    );
  }

  const checklist = [
    { done: !!formData.subject.trim(), label: "The case" },
    { done: !!formData.title.trim(), label: "Book title" },
    { done: !!formData.author.trim(), label: "Author name" },
    {
      done: !!formData.notes.trim(),
      label: "Notes (optional)",
      optional: true,
    },
    {
      done: images.length > 0,
      label: images.length
        ? `Photos (${images.length} added)`
        : "Photos (optional)",
      optional: true,
    },
  ];
  const ready = checklist.every((item) => item.done || item.optional);

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="max-w-2xl animate-fade-up">
        <p className="eyebrow">New book</p>
        <h1 className="page-title mt-2">Create a true crime book</h1>
        <p className="mt-3 text-muted">
          Tell us which case to write about. We'll research it on the live web,
          write the chapters from those sources and build your Google Play
          files. Check the facts against the source list before you publish.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-10 grid items-start gap-6 lg:grid-cols-[1fr_20rem] lg:gap-8"
      >
        <div className="space-y-6">
          <Section
            step={1}
            title="Which case does this book cover?"
            description="A real, documented case. If we can't find enough reliable sources, the book won't be written."
          >
            <div className="space-y-5">
              <div>
                <label htmlFor="subject" className="label">
                  Case name <span className="text-accent-500">*</span>
                </label>
                <input
                  id="subject"
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="input"
                  placeholder="e.g. The Lindbergh kidnapping (1932)"
                  required
                />
                <p className="hint">
                  Use the name it's generally known by, with the place and year if
                  it could be confused with another case.
                </p>
              </div>
              <div>
                <label htmlFor="notes" className="label">
                  Notes and key facts <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  rows={5}
                  maxLength={MAX_NOTES}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input resize-y"
                  placeholder="e.g. Focus on the ransom investigation and the trial evidence. Leave out speculation about other suspects."
                />
                <div className="hint flex justify-between gap-4">
                  <span>
                    Use these for direction and extra facts. Where they conflict with
                    the research, the research wins, and without a conviction a
                    person is only described as suspected or accused.
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formData.notes.length}/{MAX_NOTES}
                  </span>
                </div>
              </div>
            </div>
          </Section>

          <Section
            step={2}
            title="Book details"
            description="This is what readers will see on the title page and store listing."
          >
            <div className="space-y-5">
              <div>
                <label htmlFor="title" className="label">
                  Book title <span className="text-accent-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input"
                  placeholder="e.g. The Lindbergh Kidnapping: A Case Reexamined"
                  required
                />
                <p className="hint">
                  Pick your own. Don't reuse the title of a book, documentary or
                  podcast about this case, and don't name anyone as guilty unless
                  they were convicted.
                </p>
              </div>
              <div>
                <label htmlFor="subtitle" className="label">
                  Subtitle <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="subtitle"
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                  className="input"
                  placeholder="e.g. The 1932 Crime, the Trial and the Questions That Remain"
                />
                <p className="hint">
                  A clear angle works best (the investigation, the trial, an open question).
                  The book gives it the most weight.
                </p>
              </div>
              <div>
                <label htmlFor="author" className="label">
                  Author name <span className="text-accent-500">*</span>
                </label>
                <input
                  id="author"
                  type="text"
                  value={formData.author}
                  onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                  className="input"
                  placeholder="e.g. John Smith"
                  required
                />
              </div>
              <div>
                <label htmlFor="numberOfChapters" className="label">
                  Number of chapters
                </label>
                <input
                  id="numberOfChapters"
                  type="number"
                  min={MIN_CHAPTERS}
                  max={MAX_CHAPTERS}
                  step={1}
                  value={formData.numberOfChapters}
                  onChange={(e) =>
                    setFormData({ ...formData, numberOfChapters: Number(e.target.value) })
                  }
                  onBlur={() =>
                    setFormData((prev) => ({
                      ...prev,
                      numberOfChapters: Math.min(
                        MAX_CHAPTERS,
                        Math.max(MIN_CHAPTERS, Math.round(prev.numberOfChapters) || DEFAULT_CHAPTERS),
                      ),
                    }))
                  }
                  className="input w-32"
                />
                <p className="hint">
                  Between {MIN_CHAPTERS} and {MAX_CHAPTERS}, including the
                  introduction and the conclusion. More chapters take longer
                  to generate.
                </p>
              </div>
            </div>
          </Section>

          <Section
            step={3}
            title="Photos"
            description={`Optional. Add up to ${MAX_IMAGES} photos you have the rights to use; they're spread across the chapters.`}
          >
            {images.length < MAX_IMAGES && (
              <DropZone
                id="images"
                multiple
                onFiles={addImages}
                icon={<UploadIcon size={22} />}
                title={images.length ? "Add more photos" : "Drop photos here or browse"}
                hint="JPG or PNG. Only use photos you own or are licensed to publish. News, police and crime-scene photos usually aren't yours to use."
              />
            )}

            {images.length > 0 && (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    {images.length} of {MAX_IMAGES} photos
                  </span>
                </div>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img, index) => (
                    <li
                      key={img.preview}
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-paper ring-1 ring-line"
                    >
                      <img
                        src={img.preview}
                        alt={img.file.name}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-2 left-2 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        {index + 1}
                      </span>
                      <RemoveButton
                        onClick={() => removeImage(index)}
                        label={`Remove ${img.file.name}`}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

        </div>

        {/* Summary */}
        <aside className="space-y-5 lg:sticky lg:top-24">
          <div className="card p-6">
            <div className="mx-auto w-40">
              <BookCover
                title={formData.title || formData.subject || "Your book title"}
                author={formData.author || "Author"}
                className="aspect-[2/3] w-full"
              />
            </div>

            <ul className="mt-6 space-y-2.5 text-sm">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      item.done
                        ? "bg-brand-600 text-white"
                        : "ring-1 ring-line ring-inset"
                    }`}
                  >
                    {item.done && <CheckIcon size={12} strokeWidth={3} />}
                  </span>
                  <span className={item.done ? "text-ink" : "text-muted"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="submit"
              disabled={isLoading || !ready}
              className="btn-primary btn-lg mt-6 w-full"
            >
              {isLoading ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Starting...
                </>
              ) : (
                <>
                  <SparklesIcon size={18} />
                  Generate book
                </>
              )}
            </button>
          </div>

          <div className="rounded-2xl bg-brand-50 p-5 text-sm text-brand-900">
            <p className="flex items-center gap-2 font-semibold">
              <ImageIcon size={16} />
              What you'll get
            </p>
            <ul className="mt-3 space-y-1.5 text-brand-800">
              <li>{formData.numberOfChapters} chapters, from the first report to where the case stands</li>
              <li>A case timeline and a list of the sources used</li>
              <li>Written from live research and checked for copied text</li>
              <li>Written with respect for victims, with no gore or invented scenes</li>
              <li>2 Google Play files: an English EPUB &amp; PDF</li>
              <li>
                Your account's copyright page, contents format and fonts (
                <Link to="/profile" className="font-semibold underline">
                  edit
                </Link>
                )
              </li>
            </ul>
          </div>
        </aside>
      </form>
    </div>
  );
};

export default CreateBook;
