import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line/60 bg-[var(--canvas)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-9 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Link href="/" className="pressable inline-flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="LocalFold"
              width={28}
              height={28}
              className="h-7 w-7 rounded-lg"
            />
            <span className="text-sm font-semibold tracking-tight text-ink">
              LocalFold
            </span>
          </Link>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
            Private PDF tools in your browser. Nothing is uploaded.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-12 gap-y-6 text-sm">
          <div>
            <p className="font-semibold text-ink">Tools</p>
            <ul className="mt-2.5 space-y-2 text-ink-soft">
              <li>
                <Link
                  href="/#tools"
                  className="transition-colors hover:text-ink"
                >
                  All tools
                </Link>
              </li>
              <li>
                <Link
                  href="/tool/merge-pdf"
                  className="transition-colors hover:text-ink"
                >
                  Merge
                </Link>
              </li>
              <li>
                <Link
                  href="/tool/compress-pdf"
                  className="transition-colors hover:text-ink"
                >
                  Compress
                </Link>
              </li>
              <li>
                <Link
                  href="/tool/pdf-to-word"
                  className="transition-colors hover:text-ink"
                >
                  Convert
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink">Trust</p>
            <ul className="mt-2.5 space-y-2 text-ink-soft">
              <li>
                <Link
                  href="/privacy"
                  className="transition-colors hover:text-ink"
                >
                  Privacy
                </Link>
              </li>
              <li>No account</li>
              <li>No uploads</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {year} LocalFold</p>
          <p>Closing the tab clears your files.</p>
        </div>
      </div>
    </footer>
  );
}
