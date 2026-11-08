import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "treatment-timeline (Phase 1 Prototype)",
  description:
    "Prototype – not for clinical use – do not enter real information",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 pt-12">
        {/* Mandatory fixed banner on every page */}
        <div
          role="banner"
          className="fixed top-0 left-0 right-0 z-50 bg-amber-300 border-b border-amber-500 text-gray-900 px-4 py-2 text-center text-sm font-semibold"
        >
          Prototype – not for clinical use – do not enter real information
        </div>

        <header className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="font-bold text-lg">
              treatment-timeline{" "}
              <span className="text-xs font-normal text-gray-500">
                (Phase 1 Prototype)
              </span>
            </div>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
              >
                Timeline View (टाइमलाइन)
              </Link>
              <Link
                href="/interview"
                className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
              >
                + Add Medication Period (दवाई जोड़ें)
              </Link>
              <Link
                href="/logs"
                className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-100"
              >
                Safety Trigger Log (सुरक्षा लॉग)
              </Link>
            </nav>
          </div>
        </header>

        <main className="max-w-5xl mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}
