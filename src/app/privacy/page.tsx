import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "LocalFold processes PDFs in your browser. Files are never uploaded.",
};

export default function PrivacyPage() {
  return (
    <>
      <div className="flex-1 bg-[var(--canvas)]">
        <article className="mx-auto max-w-2xl px-5 pt-3 pb-10 sm:px-8 sm:pt-4 sm:pb-14">
          <p className="text-sm font-semibold text-moss">Privacy</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Your files stay on your device
          </h1>
          <p className="mt-3 text-base leading-relaxed text-ink-soft">
            LocalFold never needs an upload. Here’s what that means.
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft">
            <section>
              <h2 className="text-base font-semibold text-ink">No uploads</h2>
              <p className="mt-1.5">
                Files are read in your browser tab. Document contents are not
                sent to LocalFold servers.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-ink">No accounts</h2>
              <p className="mt-1.5">
                Use every tool without signing up or sharing an email.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-ink">No selling data</h2>
              <p className="mt-1.5">
                We don’t sell personal data. Browser-processed documents aren’t
                available for us to share.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-ink">Site logs</h2>
              <p className="mt-1.5">
                Hosting may log basic page requests (like IP). That’s separate
                from your PDFs, which aren’t uploaded.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-ink">On-device tools</h2>
              <p className="mt-1.5">
                OCR and converters run locally. Closing the tab clears files from
                memory.
              </p>
            </section>
          </div>

          <Link
            href="/#tools"
            className="pressable mt-10 inline-flex text-sm font-semibold text-moss hover:text-moss-deep"
          >
            ← Back to tools
          </Link>
        </article>
      </div>
      <SiteFooter />
    </>
  );
}
