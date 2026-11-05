import { DOWNLOADS } from "../config.js";
import { VISITOR_OS } from "../lib/platform.js";
import { useCopy } from "../lib/useCopy.js";
import "./TerminalInstall.css";

// The one-liner that installs DeskCharm, pointing at the script wherever this
// page is served from. Downloaded by curl or PowerShell rather than a
// browser, the app isn't marked as coming from the internet, so neither
// macOS nor Windows stops it.
const here = file => new URL(file, location.href).href;
const INSTALL = {
  mac: {
    cmd: `curl -fsSL ${here("install.sh")} | bash`,
    how: <>Paste this into Terminal. It downloads DeskCharm, puts it in Applications and opens it, with no "Not Opened" warning.</>,
  },
  windows: {
    cmd: `irm ${here("install.ps1")} | iex`,
    how: <>Paste this into PowerShell (right-click Start, then Terminal). It downloads DeskCharm, installs it and opens it, with no SmartScreen warning.</>,
  },
};

export default function TerminalInstall({ os = VISITOR_OS, id, title = `Or skip the warning: install from ${DOWNLOADS[os].shell}` }) {
  const [copied, copy] = useCopy();
  const { cmd, how } = INSTALL[os];
  return (
    <div className="term" id={id}>
      <b>{title}</b>
      <span>{how}</span>
      <div className="cmd">
        <code>{cmd}</code>
        <button type="button" onClick={() => copy(cmd)}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}
