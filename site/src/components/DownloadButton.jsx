import { DOWNLOAD_URL } from "../config.js";
import { useDownloadHelp } from "./DownloadHelp.jsx";
import { DownloadIcon } from "./Icons.jsx";

// Starts the download and, alongside it, explains how to open the app.
export default function DownloadButton({ variant = "dark", icon = true, children = "Download for Mac" }) {
  const showHelp = useDownloadHelp();
  return (
    <a className={`btn btn-${variant}`} href={DOWNLOAD_URL} download onClick={showHelp}>
      {icon && <DownloadIcon />}
      {children}
    </a>
  );
}
