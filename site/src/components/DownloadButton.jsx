import { DOWNLOAD_URL } from "../config.js";
import { DownloadIcon } from "./Icons.jsx";

export default function DownloadButton({ variant = "dark", icon = true, children = "Download for Mac" }) {
  return (
    <a className={`btn btn-${variant}`} href={DOWNLOAD_URL} download>
      {icon && <DownloadIcon />}
      {children}
    </a>
  );
}
