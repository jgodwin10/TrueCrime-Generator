// src/pages/ReadBook.tsx
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useGetBookPreviewQuery } from "../redux/api/booksApiSlice";
import { BookCover, PageLoader, StateMessage } from "../components/ui";
import { AlertCircleIcon, ClockIcon } from "../components/Icons";

const ReadBook = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    data: book,
    isLoading,
    isError,
  } = useGetBookPreviewQuery(projectId!, {
    skip: !projectId,
    refetchOnFocus: false,
  });

  // Page 0 is the title page; the rest follow the book's sections
  const pages = book ? [{ id: "title", title: "Title page" }, ...book.sections] : [];
  const requested = pages.findIndex((p) => p.id === searchParams.get("page"));
  const current = requested === -1 ? 0 : requested;
  const section = current > 0 ? book?.sections[current - 1] : undefined;

  const goTo = (index: number) => {
    if (index < 0 || index >= pages.length) return;
    setSearchParams({ page: pages[index].id });
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") goTo(current + 1);
      if (e.key === "ArrowLeft") goTo(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (isLoading) {
    return <PageLoader label="Opening your book..." />;
  }

  if (isError || !book) {
    return (
      <StateMessage
        icon={<AlertCircleIcon size={26} />}
        tone="error"
        title="Couldn't open this book"
        action={
          <Link to="/my-books" className="btn-secondary btn-lg w-full">
            Back to my books
          </Link>
        }
      >
        Please try again later.
      </StateMessage>
    );
  }

  if (book.sections.length === 0) {
    return (
      <StateMessage
        icon={<ClockIcon size={26} />}
        tone="brand"
        title="Nothing to read yet"
        action={
          <Link to={`/status/${projectId}`} className="btn-primary btn-lg w-full">
            View progress
          </Link>
        }
      >
        The first chapters are still being written. Check back in a few minutes.
      </StateMessage>
    );
  }

  const isWriting = book.status !== "COMPLETED" && book.status !== "FAILED";
  const pageLabel = (index: number) => {
    const page = index === 0 ? undefined : book.sections[index - 1];
    if (!page) return "Title page";
    return page.label ? `${page.label}: ${page.title}` : page.title;
  };

  return (
    <div className="container-page py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/my-books"
          className="text-sm font-medium text-muted transition hover:text-ink"
        >
          ← My books
        </Link>
        {book.status === "COMPLETED" && (
          <Link to={`/downloads/${projectId}`} className="btn-secondary">
            Download files
          </Link>
        )}
      </div>

      {isWriting && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">
          <ClockIcon size={18} className="mt-0.5 shrink-0" />
          <p>
            This book is still being written. You're reading the chapters
            finished so far.{" "}
            <Link to={`/status/${projectId}`} className="font-semibold underline">
              View progress
            </Link>
          </p>
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[16rem_1fr] lg:gap-10">
        {/* Contents */}
        <nav aria-label="Contents" className="lg:sticky lg:top-24">
          <label htmlFor="contents" className="label lg:hidden">
            Contents
          </label>
          <select
            id="contents"
            value={pages[current].id}
            onChange={(e) => setSearchParams({ page: e.target.value })}
            className="input lg:hidden"
          >
            {pages.map((page, index) => (
              <option key={page.id} value={page.id}>
                {pageLabel(index)}
              </option>
            ))}
          </select>

          <div className="hidden lg:block">
            <p className="eyebrow">Contents</p>
            <ol className="mt-4 max-h-[70vh] space-y-0.5 overflow-y-auto pr-2 text-sm">
              {pages.map((page, index) => (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={index === current ? "page" : undefined}
                    className={`w-full rounded-lg px-3 py-2 text-left transition ${
                      index === current
                        ? "bg-brand-50 font-semibold text-brand-800"
                        : "text-muted hover:bg-ink/5 hover:text-ink"
                    }`}
                  >
                    {pageLabel(index)}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        {/* Page */}
        <article className="card px-5 py-10 sm:px-12 sm:py-14 lg:px-16">
          <div className="mx-auto max-w-[38rem]">
            {section ? (
              <>
                <header className="mb-10 text-center">
                  {section.label && <p className="eyebrow">{section.label}</p>}
                  <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
                    {section.title}
                  </h1>
                </header>
                <div
                  className={`book-prose ${
                    section.kind === "copyright" ? "text-sm text-muted" : ""
                  }`}
                  // Server escapes the chapter text and builds the markup
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              </>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <BookCover
                  title={book.title}
                  author={book.author}
                  className="aspect-[2/3] w-40"
                />
                <h1 className="mt-10 text-3xl font-semibold sm:text-4xl">{book.title}</h1>
                {book.subtitle && (
                  <p className="mt-3 font-serif text-lg text-muted italic">{book.subtitle}</p>
                )}
                <p className="mt-8 text-sm font-semibold tracking-[0.16em] uppercase">
                  {book.author}
                </p>
              </div>
            )}

            <div className="mt-14 flex items-center justify-between gap-4 border-t border-line pt-6">
              <button
                type="button"
                onClick={() => goTo(current - 1)}
                disabled={current === 0}
                className="btn-ghost"
              >
                ← Previous
              </button>
              <span className="text-xs text-muted tabular-nums">
                {current + 1} / {pages.length}
              </span>
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                disabled={current === pages.length - 1}
                className="btn-primary"
              >
                Next →
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};

export default ReadBook;
