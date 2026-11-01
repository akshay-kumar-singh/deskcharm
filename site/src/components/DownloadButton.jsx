import { DOWNLOADS } from "../config.js";
import { VISITOR_OS, otherOS } from "../lib/platform.js";
import { useDownloadHelp } from "./DownloadHelp.jsx";
import { DownloadIcon } from "./Icons.jsx";

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

// The other computer's download, as a quiet link: for someone getting it for a PC as well as a Mac.
export function OtherDownload() {
  const os = otherOS(VISITOR_OS);
  const showHelp = useDownloadHelp();
  return <a href={DOWNLOADS[os].url} download onClick={() => showHelp(os)}>Also for {DOWNLOADS[os].name}</a>;
}
