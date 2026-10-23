export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16" />
    </svg>
  );
}

export function PlayIcon() {
  return <svg viewBox="0 0 10 10"><path d="M1 0l9 5-9 5z" fill="currentColor" /></svg>;
}

// A cup on a saucer, its steam marked so it can drift on hover.
export function CupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path className="steam" d="M7.5 2.5c-.7.9-.7 1.8 0 2.7M10.5 2.5c-.7.9-.7 1.8 0 2.7M13.5 2.5c-.7.9-.7 1.8 0 2.7" />
      <path d="M4 9h12v4.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 13.5Z" />
      <path d="M16 10.5h1.5a2.75 2.75 0 0 1 0 5.5H16M3 21.5h15" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 44 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h38m-8-8 8 8-8 8" />
    </svg>
  );
}
