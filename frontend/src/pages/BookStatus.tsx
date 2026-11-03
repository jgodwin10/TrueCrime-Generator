// src/pages/BookStatus.tsx
import { useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useGetBookStatusQuery } from "../redux/api/booksApiSlice";
import {
  BookCover,
  PageLoader,
  ProgressBar,
  Spinner,
  StateMessage,
  StatusBadge,
} from "../components/ui";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
} from "../components/Icons";

// How far along each project status is
const PHASES: Record<string, number> = {
  DRAFT: 0,
  GENERATING_CONTENT: 1,
  TRANSLATING: 2,
  GENERATING_DOCUMENTS: 2,
  COMPLETED: 3,
};

const STEPS = [
  { phase: 0, title: "Queued", body: "Your book is waiting for a free writer." },
  { phase: 1, title: "Researching and writing", body: "Live web research, then the outline and chapters, each checked for originality." },
  { phase: 2, title: "Building ebooks", body: "The English EPUB and PDF files." },
  { phase: 3, title: "Ready to publish", body: "2 files for Google Play Books." },
];

const BookStatus = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  // Use RTK Query hook with polling enabled
  const {
    data: status,
    isLoading,
    isError,
  } = useGetBookStatusQuery(projectId!, {
    pollingInterval: 5000, // Poll every 5 seconds
    skip: !projectId, // Skip query if no projectId
  });

  // Handle redirect when complete
  useEffect(() => {
    if (status?.isComplete) {
      const timer = setTimeout(() => {
        navigate(`/downloads/${projectId}`);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [status?.isComplete, navigate, projectId]);

  if (isLoading) {
    return <PageLoader label="Loading status..." />;
  }

  if (isError || !status) {
    return (
      <StateMessage
        icon={<AlertCircleIcon size={26} />}
        tone="error"
        title="Couldn't load the status"
        action={
          <Link to="/my-books" className="btn-secondary btn-lg w-full">
            Back to my books
          </Link>
        }
      >
        Please try again in a moment.
      </StateMessage>
    );
  }

  const failed = status.hasFailed || status.status === "FAILED";
  const phase = PHASES[status.status] ?? 0;

  const stats = [
    // 3 front matter pages (copyright, about, contents) plus the chapters
    {
      label: "Chapters",
      value: `${status.stats.chapters}/${3 + (status.numberOfChapters || 12)}`,
    },
    { label: "Photos", value: status.stats.images },
    { label: "Files", value: status.stats.documents },
  ];

  return (
    <div className="container-page max-w-4xl py-10 sm:py-14">
      <Link
        to="/my-books"
        className="text-sm font-medium text-muted transition hover:text-ink"
      >
        ← My books
      </Link>

      <header className="mt-6 flex animate-fade-up items-center gap-5">
        <BookCover
          title={status.title}
          size="xs"
          className="aspect-[2/3] w-16 shrink-0 p-2.5 sm:w-20"
        />
        <div className="min-w-0">
          <StatusBadge status={failed ? "FAILED" : status.status} />
          <h1 className="mt-2 text-2xl leading-tight font-semibold sm:text-3xl">
            {status.title}
          </h1>
          <p className="mt-1 text-muted">by {status.author}</p>
        </div>
        {status.stats.chapters > 0 && (
          <Link to={`/read/${projectId}`} className="btn-secondary ml-auto shrink-0">
            <BookOpenIcon size={16} />
            <span className="hidden sm:inline">Read so far</span>
          </Link>
        )}
      </header>

      <div className="card mt-8 p-6 sm:p-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted">Overall progress</p>
            <p className="mt-1 font-display text-5xl font-semibold sm:text-6xl">
              {status.progress}
              <span className="text-2xl text-muted">%</span>
            </p>
          </div>
          {!status.isComplete && !failed && (
            <p className="flex items-center gap-1.5 pb-2 text-sm text-muted">
              <ClockIcon size={16} />
              {status.estimatedCompletion}
            </p>
          )}
        </div>
        <ProgressBar value={status.progress} className="mt-5 h-3" />

        <ol className="mt-8 space-y-0">
          {STEPS.map((step, i) => {
            const done = status.isComplete || phase > step.phase;
            const active = !done && !failed && phase === step.phase;
            return (
              <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span
                    className={`absolute top-8 bottom-0 left-[0.9375rem] w-px ${
                      done ? "bg-brand-500" : "bg-line"
                    }`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    done
                      ? "bg-brand-600 text-white"
                      : active
                        ? "bg-brand-50 text-brand-700 ring-2 ring-brand-500"
                        : "bg-white text-muted ring-1 ring-line"
                  }`}
                >
                  {done ? (
                    <CheckIcon size={16} strokeWidth={2.75} />
                  ) : active ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-bold">{i + 1}</span>
                  )}
                </span>
                <div className="pt-1">
                  <p className={`font-semibold ${done || active ? "text-ink" : "text-muted"}`}>
                    {step.title}
                  </p>
                  <p className="text-sm text-muted">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4 sm:p-5">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
              {stat.label}
            </dt>
            <dd className="mt-1 font-display text-2xl font-semibold sm:text-3xl">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {status.isComplete && (
        <div className="mt-5 flex flex-col items-start gap-4 rounded-2xl bg-brand-700 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="flex items-center gap-2.5 font-semibold">
            <CheckCircleIcon size={22} />
            Your book is ready. Taking you to downloads...
          </p>
          <Link
            to={`/downloads/${projectId}`}
            className="btn w-full bg-white text-brand-800 hover:bg-paper sm:w-auto"
          >
            Go now
          </Link>
        </div>
      )}

      {failed && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-accent-50 p-5 text-accent-600 ring-1 ring-accent-100">
          <AlertCircleIcon size={22} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Generation failed</p>
            <p className="mt-0.5 text-sm">
              {status.failureReason ||
                "Something went wrong while making this book. Please try creating it again."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookStatus;
