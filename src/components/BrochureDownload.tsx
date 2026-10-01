export function BrochureDownload() {
  return (
    <a
      href="/documents/WYNDERZ_Filament_Winding_Systems_Portfolio.pdf"
      download="WYNDERZ_Filament_Winding_Systems_Portfolio.pdf"
      className="fixed bottom-5 right-4 z-50 inline-flex w-[min(20.5rem,calc(100vw-1.5rem))] items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-navy shadow-[0_12px_32px_rgba(16,24,39,0.18)] transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_16px_36px_rgba(16,24,39,0.22)] sm:bottom-6 sm:right-5 sm:w-[22rem] sm:gap-3.5 sm:px-4"
      aria-label="Download WYNDERZ Product Portfolio PDF"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-white">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-primary">
          Product Portfolio
        </span>
        <span className="mt-0.5 block font-[family-name:var(--font-display)] text-[0.82rem] font-semibold leading-snug sm:text-sm">
          Download WYNDERZ Product Portfolio
        </span>
      </span>
    </a>
  );
}
