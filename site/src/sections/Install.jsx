import { useState } from "react";
import { DOWNLOADS } from "../config.js";
import { VISITOR_OS } from "../lib/platform.js";
import DownloadButton from "../components/DownloadButton.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import Steps from "../components/Steps.jsx";
import TerminalInstall from "../components/TerminalInstall.jsx";
import "./Install.css";

// The steps and questions for each computer, opening on the visitor's own.
const GUIDES = {
  mac: {
    steps: [
      ["Download and open DeskCharm.dmg", "Drag DeskCharm onto the Applications folder."],
      ["Open it from Applications", <>DeskCharm isn't notarized by Apple yet. If macOS says it can't be opened, go to System Settings → Privacy &amp; Security and click <em>Open Anyway</em>.</>],
      ["Find ✦ in the menu bar", "Pick a hero and start flinging."],
    ],
    faq: [
      ["Do the powers close my apps?", <>No. A double-click hides the front app, just like <kbd>⌘</kbd><kbd>H</kbd>. Bring it back from the Dock or with <kbd>⌘</kbd><kbd>Tab</kbd>. Shake effects are paint only and never touch your windows.</>],
      ["Why does it ask for Screen Recording?", "It's optional. With it, the window that flies into the charm is a snapshot of the real one. Without it, it's a card with the app's icon and name. Turn it on from ✦ → Allow Window Snapshots…, then relaunch. Nothing is recorded or sent anywhere."],
      ["Will it slow my Mac down?", "It draws in about a millisecond a frame, and while a charm hangs still or a screen effect holds, it does next to nothing."],
      ["Why does macOS warn me when I open it?", <>DeskCharm isn't notarized by Apple yet, so the first time you open a downloaded copy macOS says it can't verify it. Click Done, then System Settings → Privacy &amp; Security → Open Anyway. On macOS 14 Sonoma you can instead right-click DeskCharm and choose Open. Or <a href="#terminal">install from Terminal</a>, which skips the warning.</>],
      ["Which Macs does it run on?", "Any Mac on macOS 14 Sonoma or later, Apple silicon or Intel."],
      ["How do I quit it?", "✦ in the menu bar → Quit."],
    ],
  },
  windows: {
    steps: [
      ["Download and open DeskCharm-Setup.exe", "It installs itself in a few seconds, with no questions, and opens."],
      ["Let it through, just once", <>DeskCharm isn't signed for Windows yet. If Windows says it protected your PC, click <em>More info</em>, then <em>Run anyway</em>.</>],
      ["Find it in the system tray", "Click its icon by the clock to pick a hero and start flinging."],
    ],
    faq: [
      ["Do the powers close my apps?", <>No. A double-click minimises the window in front, nothing more. Bring it back from the taskbar or with <kbd>Alt</kbd><kbd>Tab</kbd>. Shake effects are paint only and never touch your windows.</>],
      ["Does it need any permissions?", "No. The window that flies into the charm is a snapshot of the real one, and the odd window that can't be captured flies as a card with its app's icon and name. Nothing is recorded or sent anywhere."],
      ["Why does Windows warn me when I open it?", <>DeskCharm isn't signed with a Microsoft certificate yet, so SmartScreen doesn't recognise it. Click More info, then Run anyway. Or <a href="#terminal">install from PowerShell</a>, which skips the warning.</>],
      ["Which PCs does it run on?", "Any PC on Windows 10 or 11, 64-bit."],
      ["Can it start with Windows?", "Yes. Click its tray icon and tick Start with Windows."],
      ["How do I quit or uninstall it?", "Tray icon → Quit DeskCharm. To uninstall it, go to Settings → Apps and remove DeskCharm."],
    ],
  },
};

export default function Install() {
  const [os, setOs] = useState(VISITOR_OS);
  const guide = GUIDES[os];
  return (
    <section className="block tight-top" id="install">
      <div className="wrap install">
        <div>
          <SectionIntro kicker="Install." title={<>Up and swinging <em className="s">in a minute.</em></>} />
          <div className="os-switch" role="group" aria-label="Your computer">
            {Object.entries(DOWNLOADS).map(([key, d]) => (
              <button key={key} type="button" aria-pressed={key === os} onClick={() => setOs(key)}>{d.name}</button>
            ))}
          </div>
          <Steps items={guide.steps} />
          <div className="install-download"><DownloadButton os={os} /></div>
          <TerminalInstall os={os} id="terminal" />
        </div>
        <div>
          <p className="kicker">Good questions.</p>
          {guide.faq.map(([q, a], i) => <details key={`${os} ${q}`} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </div>
    </section>
  );
}
