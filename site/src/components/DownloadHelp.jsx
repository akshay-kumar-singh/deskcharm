import { createContext, useCallback, useContext, useState } from "react";
import { DOWNLOAD_URL } from "../config.js";
import Modal from "./Modal.jsx";
import Steps from "./Steps.jsx";
import TerminalInstall from "./TerminalInstall.jsx";
import "./DownloadHelp.css";

// DeskCharm isn't notarized, so a downloaded copy is stopped by Gatekeeper
// the first time it's opened. Every download button opens this alongside the
// download. It leads with Terminal, the one free way past the warning, then
// the steps to let the download through by hand.
const ShowHelp = createContext(() => {});
export const useDownloadHelp = () => useContext(ShowHelp);

const STEPS = [
  ["Open DeskCharm.dmg", "Drag DeskCharm onto the Applications folder."],
  ["Open DeskCharm from Applications", <>macOS says "DeskCharm" Not Opened. Click <span className="mac-btn">Done</span>, not Move to Bin.</>],
  ["Allow it in System Settings", <>Go to Privacy &amp; Security, scroll down and click <span className="mac-btn">Open Anyway</span>, then confirm with your password. Look for ✦ in the menu bar.</>],
];

export function DownloadHelpProvider({ children }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  return (
    <ShowHelp value={show}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} label="Opening DeskCharm" className="download-help">
        <div className="download-help-body">
          <p className="kicker">Your download has started</p>
          <h3>One more step, <em className="s">just once.</em></h3>
          <p className="download-help-lede">DeskCharm isn't notarized by Apple yet, so macOS stops it the first time it opens. Skip that with one line in Terminal, or let it through yourself.</p>
          <TerminalInstall title="Install from Terminal" badge="Recommended · no warning" />
          <p className="download-help-or"><span>Or open the download yourself</span></p>
          <Steps items={STEPS} />
          <p className="download-help-tip"><b>On macOS 14 Sonoma?</b> Skip System Settings: right-click DeskCharm in Applications and choose <span className="mac-btn">Open</span>.</p>
          <p className="download-help-retry">Download didn't start? <a href={DOWNLOAD_URL}>Download again</a></p>
        </div>
      </Modal>
    </ShowHelp>
  );
}
