import { DOWNLOADS } from "../config.js";
import { VISITOR_OS, otherOS } from "../lib/platform.js";
import { useDownloadHelp } from "./DownloadHelp.jsx";
import { DownloadIcon } from "./Icons.jsx";
import "./DownloadButton.css";

// Starts the download for the visitor's own computer, or `os`, and alongside
// it explains how to open the app.
export default function DownloadButton({ os = VISITOR_OS, variant = "dark", icon = true, children = `Download for ${DOWNLOADS[os].name}` }) {
  const showHelp = useDownloadHelp();
  return (
    <a className={`btn btn-${variant}`} href={DOWNLOADS[os].url} download onClick={() => showHelp(os)}>
      {icon && <DownloadIcon />}
      {children}
    </a>
  );
}

// Both downloads side by side, the visitor's own computer first and filled
// in, each with what it needs beneath it.
export function Downloads({ variants = ["dark", "ghost"] }) {
  return (
    <div className="downloads">
      {[VISITOR_OS, otherOS(VISITOR_OS)].map((os, i) => (
        <div key={os}>
          <DownloadButton os={os} variant={variants[i]} />
          <span>{DOWNLOADS[os].needs} · {DOWNLOADS[os].size}</span>
        </div>
      ))}
    </div>
  );
}
