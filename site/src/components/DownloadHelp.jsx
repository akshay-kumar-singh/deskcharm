import { createContext, useCallback, useContext, useState } from "react";
import { DOWNLOADS, PORTFOLIO_URL } from "../config.js";
import Modal from "./Modal.jsx";
import Steps from "./Steps.jsx";
import TerminalInstall from "./TerminalInstall.jsx";
import "./DownloadHelp.css";

// DeskCharm isn't notarized by Apple or signed for Windows, so a downloaded
// copy is stopped the first time it's opened: by Gatekeeper on a Mac, by
// SmartScreen on Windows. Every download button opens this alongside the
// download, for the computer it's for. It leads with the one line that
// installs without the warning, then the steps to let the download through
// by hand.
const ShowHelp = createContext(() => {});
export const useDownloadHelp = () => useContext(ShowHelp);

const HELP = {
  mac: {
    lede: "DeskCharm isn't notarized by Apple yet, so macOS stops it the first time it opens. Skip that with one line in Terminal, or let it through yourself.",
    steps: [
      ["Open DeskCharm.dmg", "Drag DeskCharm onto the Applications folder."],
      ["Open DeskCharm from Applications", <>macOS says "DeskCharm" Not Opened. Click <span className="ui-btn">Done</span>, not Move to Bin.</>],
      ["Allow it in System Settings", <>Go to Privacy &amp; Security, scroll down and click <span className="ui-btn">Open Anyway</span>, then confirm with your password. Look for ✦ in the menu bar.</>],
    ],
    tip: <><b>On macOS 14 Sonoma?</b> Skip System Settings: right-click DeskCharm in Applications and choose <span className="ui-btn">Open</span>.</>,
  },
  windows: {
    lede: "DeskCharm isn't signed for Windows yet, so Windows warns you the first time it runs. Skip that with one line in PowerShell, or let it through yourself.",
    steps: [
      ["Keep the download", <>If your browser says it isn't commonly downloaded, keep it. In Edge, that's <span className="ui-btn">⋯</span> → Keep → Show more → <span className="ui-btn">Keep anyway</span>.</>],
      ["Open DeskCharm-Setup.exe", <>If "Windows protected your PC" appears, click More info, then <span className="ui-btn">Run anyway</span>.</>],
      ["Find your charm", "It installs itself in a few seconds and opens. The charm hangs from the top of your screen, and its menu is in the system tray."],
    ],
    tip: <><b>Can't see it in the tray?</b> Click <span className="ui-btn">^</span> by the clock to show the hidden icons.</>,
  },
};

export function DownloadHelpProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [os, setOs] = useState("mac");
  const show = useCallback(os => { setOs(os); setOpen(true); }, []);
  const help = HELP[os], download = DOWNLOADS[os];
  return (
    <ShowHelp value={show}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} label="Opening DeskCharm" className="download-help">
        <div className="download-help-body">
          <p className="kicker">Your download has started</p>
          <h3>One more step, <em className="s">just once.</em></h3>
          <p className="download-help-lede">{help.lede}</p>
          <TerminalInstall os={os} title={`Install from ${download.shell}`} badge="Recommended · no warning" />
          <p className="download-help-or"><span>Or open the download yourself</span></p>
          <Steps items={help.steps} />
          <p className="download-help-tip">{help.tip}</p>
          <p className="download-help-retry">Download didn't start? <a href={download.url}>Download again</a></p>
          <p className="download-help-maker">Made by Akshay Kumar Singh · <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">See more of my work</a></p>
        </div>
      </Modal>
    </ShowHelp>
  );
}
