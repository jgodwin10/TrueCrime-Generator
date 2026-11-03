// src/pages/MyBooks.tsx (Fixed - Cache Busting Version)
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { type RootState } from "../redux/store";
import {
  useGetProjectsQuery,
  useDeleteProjectMutation,
} from "../redux/api/projectsApiSlice";
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
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from "../components/Icons";

const ProjectCard = ({ project, onDelete, isDeleting, deleteId }: any) => {
  const shouldPoll =
    project.status === "GENERATING_CONTENT" ||
    project.status === "TRANSLATING" ||
    project.status === "GENERATING_DOCUMENTS" ||
    project.status === "IN_PROGRESS";

  const { data: liveStatus } = useGetBookStatusQuery(project.id, {
    skip: !shouldPoll,
    pollingInterval: shouldPoll ? 5000 : 0,
    refetchOnMountOrArgChange: true,
  });

  // Use live status if available, otherwise use project status
  const currentStatus = liveStatus?.status || project.status;
  const progress = liveStatus?.progress ?? 0;

  const deleting = isDeleting && deleteId === project.id;

  return (
    <article className="card group flex flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:shadow-lift">
      <div className="relative flex justify-center bg-gradient-to-b from-paper to-line/40 px-6 pt-8 pb-6">
        <BookCover
          title={project.title}
          author={project.author}
          size="sm"
          className="aspect-[2/3] w-28 transition duration-300 group-hover:-rotate-2"
        />
        <button
          onClick={() => onDelete(project.id)}
          disabled={deleting}
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-muted shadow-soft backdrop-blur transition hover:bg-white hover:text-accent-600 disabled:opacity-60"
          title="Delete book"
          aria-label={`Delete ${project.title}`}
        >
          {deleting ? <Spinner className="h-4 w-4" /> : <TrashIcon size={16} />}
        </button>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
          <StatusBadge status={currentStatus} />
          <span className="flex items-center gap-1">
            <CalendarIcon size={13} />
            {new Date(project.createdAt).toLocaleDateString()}
          </span>
        </div>

        <h3 className="mt-3 text-lg leading-snug font-semibold">{project.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">
          {project.subtitle || "No subtitle"}
        </p>

        {shouldPoll && liveStatus && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs font-medium text-muted">
              <span>{liveStatus.estimatedCompletion ? `About ${liveStatus.estimatedCompletion} left` : "Working..."}</span>
              <span className="text-ink">{progress}%</span>
            </div>
            <ProgressBar value={progress} />
          </div>
        )}

        <div className="mt-auto pt-5">
          {currentStatus === "COMPLETED" ? (
            <div className="grid grid-cols-2 gap-2">
              <Link to={`/read/${project.id}`} className="btn-secondary">
                <BookOpenIcon size={16} />
                Read
              </Link>
              <Link to={`/downloads/${project.id}`} className="btn-primary">
                <DownloadIcon size={16} />
                Download
              </Link>
            </div>
          ) : shouldPoll ? (
            <Link to={`/status/${project.id}`} className="btn-secondary w-full">
              <ClockIcon size={16} />
              View progress
            </Link>
          ) : currentStatus === "FAILED" ? (
            <Link
              to={`/status/${project.id}`}
              className="btn-secondary w-full text-accent-600 hover:border-accent-500/40"
            >
              <AlertCircleIcon size={16} />
              View error
            </Link>
          ) : (
            <Link to={`/status/${project.id}`} className="btn-secondary w-full">
              <EyeIcon size={16} />
              View details
            </Link>
          )}
        </div>
      </div>
    </article>
  );
};

const MyBooks = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const hasValidUser =
    user?.id && typeof user.id === "string" && user.id.length > 0;

  const {
    data: projects = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useGetProjectsQuery(hasValidUser ? { userId: user.id } : undefined, {
    skip: !hasValidUser,
    pollingInterval: 10000,
    refetchOnMountOrArgChange: true,
    // CRITICAL FIX: Force refetch to bypass cache
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });

  // Force initial refetch when component mounts
  useEffect(() => {
    if (hasValidUser) {
      console.log("🔄 Force refetching projects...");
      refetch();
    }
  }, [hasValidUser]);

  useEffect(() => {
    console.log("📊 Projects loaded:", projects?.length || 0);
    if (projects?.length > 0) {
      console.log("Projects:", projects);
    }
  }, [projects]);

  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation();

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this book?")) return;

    try {
      setDeleteId(id);
      await deleteProject(id).unwrap();
      toast.success("Book deleted successfully");
      setDeleteId(null);
      refetch();
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to delete book");
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return <PageLoader label="Loading your books..." />;
  }

  if (!hasValidUser) {
    return (
      <StateMessage
        icon={<AlertCircleIcon size={26} />}
        tone="error"
        title="Please sign in"
        action={
          <Link to="/login" className="btn-primary btn-lg w-full">
            Go to login
          </Link>
        }
      >
        You need an account to view your books.
      </StateMessage>
    );
  }

  if (isError) {
    return (
      <StateMessage
        icon={<AlertCircleIcon size={26} />}
        tone="error"
        title="Couldn't load your books"
        action={
          <button onClick={() => refetch()} className="btn-primary btn-lg w-full">
            <RefreshIcon size={18} />
            Try again
          </button>
        }
      >
        {typeof error === "object" && error !== null && "data" in error
          ? (error as any).data?.message || "Something went wrong"
          : "Please try again later"}
      </StateMessage>
    );
  }

  const hasInProgressProjects = projects.some(
    (p) =>
      p.status === "IN_PROGRESS" ||
      p.status === "GENERATING_CONTENT" ||
      p.status === "TRANSLATING" ||
      p.status === "GENERATING_DOCUMENTS",
  );

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="page-title mt-2">My books</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            {projects.length} {projects.length === 1 ? "book" : "books"}
            {hasInProgressProjects && (
              <span className="inline-flex items-center gap-1.5 text-sm text-brand-700">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                Updating live
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="btn-secondary h-11 w-11 shrink-0 px-0"
            title="Refresh"
            aria-label="Refresh books"
          >
            <RefreshIcon size={18} />
          </button>
          <Link to="/create" className="btn-primary flex-1 sm:flex-none">
            <PlusIcon size={16} strokeWidth={2.25} />
            New book
          </Link>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center px-6 py-16 text-center">
          <div className="flex items-end gap-2" aria-hidden="true">
            <div className="h-20 w-14 -rotate-6 rounded-sm bg-brand-100" />
            <div className="h-24 w-16 rounded-sm bg-brand-700" />
            <div className="h-20 w-14 rotate-6 rounded-sm bg-accent-100" />
          </div>
          <h2 className="mt-8 text-2xl font-semibold">Your shelf is empty</h2>
          <p className="mt-2 max-w-sm text-muted">
            Create your first true crime book. It only takes the name of the case,
            a title and an author name.
          </p>
          <Link to="/create" className="btn-primary btn-lg mt-8">
            <PlusIcon size={18} strokeWidth={2.25} />
            Create your first book
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={handleDelete}
              isDeleting={isDeleting}
              deleteId={deleteId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MyBooks;
