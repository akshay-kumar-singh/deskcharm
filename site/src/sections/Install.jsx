import DownloadButton from "../components/DownloadButton.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import Steps from "../components/Steps.jsx";
import TerminalInstall from "../components/TerminalInstall.jsx";
import "./Install.css";

const STEPS = [
  ["Download and open DeskCharm.dmg", "Drag DeskCharm onto the Applications folder."],
  ["Open it from Applications", <>DeskCharm isn't notarized by Apple yet. If macOS says it can't be opened, go to System Settings → Privacy &amp; Security and click <em>Open Anyway</em>.</>],
  ["Find ✦ in the menu bar", "Pick a hero and start flinging."],
];

const FAQ = [
  ["Do the powers close my apps?", <>No. A double-click hides the front app, just like <kbd>⌘</kbd><kbd>H</kbd>. Bring it back from the Dock or with <kbd>⌘</kbd><kbd>Tab</kbd>. Shake effects are paint only and never touch your windows.</>],
  ["Why does it ask for Screen Recording?", "It's optional. With it, the window that flies into the charm is a snapshot of the real one. Without it, it's a card with the app's icon and name. Turn it on from ✦ → Allow Window Snapshots…, then relaunch. Nothing is recorded or sent anywhere."],
  ["Will it slow my Mac down?", "It draws in about a millisecond a frame, and while a charm hangs still or a screen effect holds, it does next to nothing."],
  ["Why does macOS warn me when I open it?", <>DeskCharm isn't notarized by Apple yet, so the first time you open a downloaded copy macOS says it can't verify it. Click Done, then System Settings → Privacy &amp; Security → Open Anyway. Or <a href="#terminal">install from Terminal</a>, which skips the warning.</>],
  ["Which Macs does it run on?", "Any Mac on macOS 14 Sonoma or later, Apple silicon or Intel."],
  ["How do I quit it?", "✦ in the menu bar → Quit."],
];

export default function Install() {
  return (
    <section className="block tight-top" id="install">
      <div className="wrap install">
        <div>
          <SectionIntro kicker="Install." title={<>Up and swinging <em className="s">in a minute.</em></>} />
          <Steps items={STEPS} />
          <div className="install-download"><DownloadButton /></div>
          <TerminalInstall id="terminal" />
        </div>
        <div>
          <p className="kicker">Good questions.</p>
          {FAQ.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </div>
    </section>
  );
}
