// src/components/Navigation.tsx
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../redux/features/authSlice";
import { useLogoutMutation } from "../redux/api/authApiSlice";
import { toast } from "react-toastify";
import type { RootState } from "../redux/store";
import {
  BookOpenIcon,
  ChevronDownIcon,
  LogOutIcon,
  MenuIcon,
  PlusIcon,
  UserIcon,
  XIcon,
} from "./Icons";

export const Logo = () => (
  <Link to="/" className="group flex items-center gap-2.5">
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-paper shadow-soft transition group-hover:rotate-[-4deg]">
      <BookOpenIcon size={18} strokeWidth={2} />
    </span>
    <span className="font-display text-lg leading-none font-semibold tracking-tight">
      True Crime
      <span className="text-accent-500"> Generator</span>
    </span>
  </Link>
);

const initials = (name?: string) =>
  (name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${
    isActive ? "bg-ink/[0.06] text-ink" : "text-muted hover:text-ink"
  }`;

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center rounded-xl px-4 py-3 text-base font-medium transition ${
    isActive ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-ink/[0.04]"
  }`;

const Navigation = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state: RootState) => state.auth);
  const [logoutApi] = useLogoutMutation();

  // Menus remember the page they were opened on, so navigating closes them
  const [mobileOpenOn, setMobileOpenOn] = useState<string | null>(null);
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const mobileOpen = mobileOpenOn === location.pathname;
  const menuOpen = menuOpenOn === location.pathname;
  const setMobileOpen = (open: boolean) =>
    setMobileOpenOn(open ? location.pathname : null);
  const setMenuOpen = (open: boolean) =>
    setMenuOpenOn(open ? location.pathname : null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenOn(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Lock page scroll behind the mobile menu
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    try {
      await logoutApi({}).unwrap();
      dispatch(logout());
      toast.success("Logged out successfully");
      navigate("/");
    } catch {
      toast.error("Logout failed");
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/80 backdrop-blur-lg">
        <nav className="container-page flex h-16 items-center justify-between">
          <Logo />

          {/* Desktop */}
          <div className="hidden items-center gap-1 md:flex">
            <NavLink to="/" end className={desktopLinkClass}>
              Home
            </NavLink>

            {user ? (
              <>
                <NavLink to="/my-books" className={desktopLinkClass}>
                  My Books
                </NavLink>
                <Link to="/create" className="btn-primary ml-2">
                  <PlusIcon size={16} strokeWidth={2.25} />
                  New book
                </Link>

                <div className="relative ml-2" ref={menuRef}>
                  <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pr-3 pl-1 text-sm font-medium transition hover:border-ink/20"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-600">
                      {initials(user.name)}
                    </span>
                    <span className="max-w-[8rem] truncate">{user.name}</span>
                    <ChevronDownIcon
                      size={16}
                      className={`text-muted transition ${menuOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="card absolute right-0 mt-2 w-56 animate-fade-up overflow-hidden p-1.5"
                    >
                      <div className="px-3 py-2.5">
                        <p className="truncate text-sm font-semibold">
                          {user.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {user.email}
                        </p>
                      </div>
                      <div className="my-1 h-px bg-line" />
                      <Link
                        to="/profile"
                        role="menuitem"
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-paper"
                      >
                        <UserIcon size={16} className="text-muted" />
                        Profile
                      </Link>
                      <button
                        onClick={handleLogout}
                        role="menuitem"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-paper"
                      >
                        <LogOutIcon size={16} className="text-muted" />
                        Log out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <NavLink to="/login" className={desktopLinkClass}>
                  Log in
                </NavLink>
                <Link to="/register" className="btn-primary ml-2">
                  Get started
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink transition hover:bg-ink/5 md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <XIcon size={22} /> : <MenuIcon size={22} />}
          </button>
        </nav>

      </header>

      {/* Mobile menu: outside the header, whose backdrop-blur would
          otherwise trap this fixed panel inside its 4rem height */}
      {mobileOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 animate-fade-up overflow-y-auto border-t border-line bg-paper md:hidden">
          <div className="container-page flex flex-col gap-1 py-4">
            {user && (
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-100 text-sm font-bold text-accent-600">
                  {initials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{user.name}</p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                </div>
              </div>
            )}

            <NavLink to="/" end className={mobileLinkClass}>
              Home
            </NavLink>

            {user ? (
              <>
                <NavLink to="/my-books" className={mobileLinkClass}>
                  My Books
                </NavLink>
                <NavLink to="/profile" className={mobileLinkClass}>
                  Profile
                </NavLink>
                <Link to="/create" className="btn-primary btn-lg mt-4 w-full">
                  <PlusIcon size={18} strokeWidth={2.25} />
                  New book
                </Link>
                <button
                  onClick={handleLogout}
                  className="btn-secondary btn-lg mt-2 w-full"
                >
                  <LogOutIcon size={18} />
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={mobileLinkClass}>
                  Log in
                </NavLink>
                <Link to="/register" className="btn-primary btn-lg mt-4 w-full">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Navigation;
