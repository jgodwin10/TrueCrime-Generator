import { Link, useParams } from "react-router-dom";
import { useGetDownloadLinksQuery } from "../redux/api/booksApiSlice";
import { useMemo } from "react";
import { BookCover, PageLoader, StateMessage } from "../components/ui";
import {
  AlertCircleIcon,
  BookOpenIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
} from "../components/Icons";

// EPUB first: it's the format Google Play prefers
const typeRank = (type: string) => ["EPUB", "PDF", "DOCX"].indexOf(type);

interface Document {
  id: string;
  filename: string;
  type: string;
  language: string;
  url: string; // Cloudinary URL
  size: string;
  createdAt: string;
}

const Downloads = () => {
  const { projectId } = useParams<{ projectId: string }>();

  const {
    data: downloads,
    isLoading,
    isError,
  } = useGetDownloadLinksQuery(projectId!, {
    skip: !projectId,
  });

  // English-only: one EPUB and one PDF, EPUB first
  const documents = useMemo(
    () =>
      [...(downloads?.documents ?? [])].sort(
        (a, b) => typeRank(a.type) - typeRank(b.type),
      ),
    [downloads?.documents],
  );

  /**
   * Handle download with proper filename
   */
  const handleDownload = async (doc: Document) => {
    try {
      // Option 1: Direct download using fetch
      const response = await fetch(doc.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      // Fallback: Open in new tab
      window.open(doc.url, "_blank");
    }
  };

  if (isLoading) {
    return <PageLoader label="Loading downloads..." />;
  }

  if (isError || !downloads) {
    return (
      <StateMessage
        icon={<AlertCircleIcon size={26} />}
        tone="error"
        title="Couldn't load downloads"
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

  if (downloads.totalDocuments === 0) {
    return (
      <StateMessage
        icon={<ClockIcon size={26} />}
        tone="brand"
        title="Still being made"
        action={
          <Link to={`/status/${projectId}`} className="btn-primary btn-lg w-full">
            View progress
          </Link>
        }
      >
        Your files are still being generated. Check back in a few minutes.
      </StateMessage>
    );
  }

  return (
    <div className="container-page py-10 sm:py-14">
      <Link
        to="/my-books"
        className="text-sm font-medium text-muted transition hover:text-ink"
      >
        ← My books
      </Link>

      <header className="mt-6 flex animate-fade-up flex-col gap-6 sm:flex-row sm:items-center">
        <BookCover
          title={downloads.title || "Your book"}
          className="aspect-[2/3] w-24 shrink-0 sm:w-28"
        />
        <div>
          <p className="eyebrow">Ready to publish</p>
          <h1 className="page-title mt-2">{downloads.title || "Your book is ready"}</h1>
          <p className="mt-2 text-muted">
            {downloads.totalDocuments}{" "}
            {downloads.totalDocuments === 1 ? "file" : "files"} · English
          </p>
          <Link to={`/read/${projectId}`} className="btn-secondary mt-4">
            <BookOpenIcon size={16} />
            Read online
          </Link>
        </div>
      </header>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <ul className="grid gap-4 sm:grid-cols-2">
          {documents.map((doc) => {
            const isEpub = doc.type === "EPUB";
            return (
              <li key={doc.id}>
                <button
                  onClick={() => handleDownload(doc)}
                  className="card group flex h-full w-full flex-col p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                      isEpub
                        ? "bg-brand-700 text-white"
                        : "bg-accent-50 text-accent-600"
                    }`}
                  >
                    {isEpub ? <BookOpenIcon size={22} /> : <FileTextIcon size={22} />}
                  </span>
                  <span className="mt-5 flex items-center gap-2 font-display text-2xl font-semibold">
                    {doc.type}
                    {isEpub && (
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 font-sans text-[10px] font-bold tracking-wide text-brand-700 uppercase">
                        Main file
                      </span>
                    )}
                  </span>
                  <span className="mt-1 text-sm text-muted">
                    {isEpub
                      ? "Reflowable ebook. Upload this to Google Play."
                      : "Fixed pages. Optional, shown as “original pages”."}
                  </span>
                  <span className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm">
                    <span className="text-muted">{doc.size}</span>
                    <span className="flex items-center gap-1.5 font-semibold text-brand-700">
                      Download
                      <DownloadIcon
                        size={16}
                        className="transition group-hover:translate-y-0.5"
                      />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <aside className="rounded-2xl bg-brand-800 p-6 text-brand-100 lg:sticky lg:top-24">
          <h2 className="text-xl font-semibold text-paper">Publishing on Google Play</h2>
          <ol className="mt-5 space-y-4 text-sm">
            {[
              "Open Google Play Books Partner Center and add a new book.",
              "Upload the EPUB as the main file. The PDF is optional.",
              "Upload a cover image, describe the book as an independent true crime account, then set the price and publish.",
            ].map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-paper">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
};

export default Downloads;
