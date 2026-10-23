import { useCopy } from "../lib/useCopy.js";
import "./TerminalInstall.css";

// The Terminal one-liner, pointing at wherever this page is served from.
// Fetched with curl, the app isn't quarantined, so macOS doesn't stop it.
const installCmd = `curl -fsSL ${new URL("install.sh", location.href).href} | bash`;

export default function TerminalInstall({ id, title = "Or skip the warning: install from Terminal", badge }) {
  const [copied, copy] = useCopy();
  return (
    <div className="term" id={id}>
      <b>{title}{badge && <em className="term-badge">{badge}</em>}</b>
      <span>Paste this into Terminal. It downloads DeskCharm, puts it in Applications and opens it, with no "Not Opened" warning.</span>
      <div className="cmd">
        <code>{installCmd}</code>
        <button type="button" onClick={() => copy(installCmd)}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}
