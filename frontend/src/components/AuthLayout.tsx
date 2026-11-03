// src/components/AuthLayout.tsx
import type { ReactNode } from "react";
import { BookCover } from "./ui";

const AuthLayout = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}) => (
  <div className="container-page grid items-start gap-10 py-12 sm:py-16 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-10">
    {/* Brand panel (desktop) */}
    <div className="relative hidden h-full max-h-[40rem] overflow-hidden rounded-3xl bg-brand-800 p-12 text-paper lg:flex lg:flex-col lg:justify-between">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-brand-600/60 blur-3xl"
      />
      <p className="relative font-display text-3xl leading-snug font-medium">
        “A full true crime book, from the first report to where the case
        stands today, built from the name of a case.”
      </p>
      <div className="relative flex items-end gap-4" aria-hidden="true">
        <BookCover title="The Car on the Service Road" author="Your name" size="sm" palette={2} className="aspect-[2/3] w-32 -rotate-6" />
        <BookCover title="The Receipt Nobody Checked" author="Your name" size="sm" palette={3} className="aspect-[2/3] w-36" />
        <BookCover title="Forty Hours Without a Call" author="Your name" size="sm" palette={1} className="aspect-[2/3] w-32 rotate-6" />
      </div>
    </div>

    {/* Form */}
    <div className="mx-auto w-full max-w-md animate-fade-up">
      <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
      <div className="mt-8">{children}</div>
    </div>
  </div>
);

export default AuthLayout;
