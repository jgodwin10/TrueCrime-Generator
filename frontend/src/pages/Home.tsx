import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { BookCover } from "../components/ui";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  PenIcon,
  SmartphoneIcon,
} from "../components/Icons";

// Sample covers for the hero (historical figures, for illustration)
const SAMPLE_BOOKS = [
  { title: "The Car on the Service Road", palette: 0, rotate: "-rotate-[14deg]", x: "-translate-x-[52%]" },
  { title: "Forty Hours Without a Call", palette: 2, rotate: "-rotate-[7deg]", x: "-translate-x-[26%]" },
  { title: "The Receipt Nobody Checked", palette: 1, rotate: "rotate-0", x: "translate-x-0" },
  { title: "What the Jury Never Heard", palette: 3, rotate: "rotate-[7deg]", x: "translate-x-[26%]" },
  { title: "Nine Days at the County Line", palette: 4, rotate: "rotate-[14deg]", x: "translate-x-[52%]" },
];

const FEATURES = [
  {
    icon: PenIcon,
    title: "Reads like real true crime",
    body: "Twelve narrative chapters that follow a case in order, from the first report to where it stands today, with a case timeline at the end.",
  },
  {
    icon: CheckCircleIcon,
    title: "Researched and respectful",
    body: "Written from live web research, with a source list. Checked for copied text. Victims come first: no gore, no invented scenes, and nobody called guilty without a conviction.",
  },
  {
    icon: SmartphoneIcon,
    title: "Ready for Google Play Books",
    body: "A validated English EPUB plus a digital PDF, with a tappable table of contents, bookmarks and your photos in place.",
  },
];

const STEPS = [
  { title: "Name the case", body: "Tell us which case the book covers." },
  { title: "Add your angle", body: "A title, subtitle, and any notes or photos you have." },
  { title: "Let it write", body: "We research the case, then write twelve original chapters." },
  { title: "Publish", body: "Download the EPUB and PDF, and upload to Google Play." },
];

const Home = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const startLink = user ? "/create" : "/register";

  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(60%_60%_at_70%_20%,var(--color-brand-100),transparent_70%),radial-gradient(40%_40%_at_10%_10%,var(--color-accent-100),transparent_70%)] opacity-70"
        />
        <div className="container-page grid items-center gap-14 pt-14 pb-20 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-24 lg:pb-28">
          <div className="animate-fade-up text-center lg:text-left">
            <p className="eyebrow">For Google Play Books</p>
            <h1 className="mt-4 text-[2.6rem] leading-[1.05] font-semibold sm:text-6xl lg:text-[4.1rem]">
              Every case has a record.{" "}
              <em className="font-normal text-brand-700">Write the true crime book</em>{" "}
              in minutes.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted lg:mx-0">
              Name a case and choose your angle. Get a full, carefully
              written true crime book as polished EPUB and PDF ebooks.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <Link to={startLink} className="btn-primary btn-lg w-full sm:w-auto">
                Start a book
                <ArrowRightIcon size={18} strokeWidth={2} />
              </Link>
              <a href="#how-it-works" className="btn-secondary btn-lg w-full sm:w-auto">
                See how it works
              </a>
            </div>
            <ul className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted lg:justify-start">
              {["12 chapters", "Case timeline", "EPUB + PDF"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CheckIcon size={16} strokeWidth={2.5} className="text-brand-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Fanned sample covers */}
          <div
            className="relative mx-auto h-64 w-full max-w-md scale-[0.78] sm:h-96 sm:scale-100"
            aria-hidden="true"
          >
            {SAMPLE_BOOKS.map((book, i) => (
              <div
                key={book.title}
                className={`absolute top-6 left-1/2 -ml-[4.5rem] w-36 origin-bottom transition duration-500 hover:-translate-y-3 sm:-ml-24 sm:w-48 ${book.rotate} ${book.x}`}
                style={{ zIndex: i === 2 ? 10 : 5 - Math.abs(i - 2) }}
              >
                <BookCover
                  title={book.title}
                  palette={book.palette}
                  author="Jane Doe"
                  size="md"
                  className="aspect-[2/3] w-full"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-line bg-white">
        <div className="container-page grid gap-10 py-16 sm:py-20 md:grid-cols-3 md:gap-8">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Icon size={22} />
              </span>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container-page scroll-mt-20 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">
            From a name to a finished book in four steps
          </h2>
        </div>
        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card relative p-6">
              <span className="font-display text-5xl leading-none font-semibold text-accent-500/90">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      <section className="container-page pb-20 sm:pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-brand-800 px-6 py-14 text-center sm:px-12 sm:py-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-600/50 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-accent-500/25 blur-2xl"
          />
          <h2 className="relative text-3xl font-semibold text-paper sm:text-4xl">
            Which case will you write first?
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-brand-100">
            Most books are finished in 10 to 15 minutes. Your EPUB and
            PDF are ready the moment it's done.
          </p>
          <Link
            to={startLink}
            className="btn btn-lg relative mt-8 bg-paper text-brand-800 hover:bg-white"
          >
            Start writing
            <ArrowRightIcon size={18} strokeWidth={2} />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default Home;
