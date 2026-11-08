"use client";

import React, { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangProvider, useLang, useT } from "./i18n";

function AppFrame({ children }: { children: ReactNode }) {
  const t = useT();
  const { lang, setLang } = useLang();
  const pathname = usePathname();

  return (
    <div lang={lang} className="relative min-h-screen">
      <div aria-hidden className="app-backdrop">
        <span />
        <span />
        <span />
      </div>
      <div role="note" className="prototype-banner">
        {t("banner")}
      </div>
      <header className="header-glass border-b border-border">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/" className="title-gradient text-xl font-bold">
            {t("appName")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex items-center gap-1 text-base">
              <Link
                href="/"
                className="nav-link"
                aria-current={pathname === "/" ? "page" : undefined}
              >
                {t("home")}
              </Link>
              <Link
                href="/logs"
                className="nav-link"
                aria-current={pathname === "/logs" ? "page" : undefined}
              >
                {t("safetyLog")}
              </Link>
            </nav>
            <div role="group" aria-label="Language" className="lang-toggle">
              <button
                type="button"
                aria-pressed={lang === "hi"}
                onClick={() => setLang("hi")}
              >
                हिंदी
              </button>
              <button
                type="button"
                aria-pressed={lang === "en"}
                onClick={() => setLang("en")}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </header>
      <main key={pathname} className="page-enter mx-auto max-w-2xl px-5 py-8">
        {children}
      </main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <AppFrame>{children}</AppFrame>
    </LangProvider>
  );
}
