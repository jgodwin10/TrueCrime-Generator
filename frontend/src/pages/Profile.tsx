// src/pages/Profile.tsx
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { type RootState } from "../redux/store";
import { BookOpenIcon, HashIcon, MailIcon, UserIcon } from "../components/Icons";
import CopyrightSettings from "../components/CopyrightSettings";
import TableOfContentsSettings from "../components/TableOfContentsSettings";
import FontSettings from "../components/FontSettings";

const Profile = () => {
  const { user } = useSelector((state: RootState) => state.auth);

  const initials = (user?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const rows = [
    { icon: UserIcon, label: "Full name", value: user?.name },
    { icon: MailIcon, label: "Email", value: user?.email },
    { icon: HashIcon, label: "Account ID", value: user?.id, mono: true },
  ];

  return (
    <div className="container-page max-w-5xl py-10 sm:py-14">
      <p className="eyebrow">Account</p>
      <h1 className="page-title mt-2">My profile</h1>

      <div className="card mt-8 animate-fade-up overflow-hidden">
        <div className="flex flex-col items-center gap-4 bg-gradient-to-br from-brand-700 to-brand-800 px-6 py-8 text-center sm:flex-row sm:text-left">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 font-display text-3xl font-semibold text-accent-600 ring-4 ring-white/15">
            {initials}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold text-paper">{user?.name}</h2>
            <p className="truncate text-brand-100">{user?.email}</p>
          </div>
        </div>

        <dl className="divide-y divide-line">
          {rows.map(({ icon: Icon, label, value, mono }) => (
            <div key={label} className="flex items-start gap-4 px-6 py-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper text-muted ring-1 ring-line">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {label}
                </dt>
                <dd
                  className={`mt-0.5 break-all ${mono ? "font-mono text-sm text-muted" : "text-base"}`}
                >
                  {value}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      <CopyrightSettings />

      <TableOfContentsSettings />

      <FontSettings />

      <Link to="/my-books" className="btn-secondary btn-lg mt-6 w-full sm:w-auto">
        <BookOpenIcon size={18} />
        Go to my books
      </Link>
    </div>
  );
};

export default Profile;
