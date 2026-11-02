import { PORTFOLIO_URL, YOUTUBE_URL } from "../config.js";
import { ExternalIcon } from "../components/Icons.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import "./Maker.css";

const external = { target: "_blank", rel: "noopener noreferrer" };
const portfolio = section => new URL(`#${section}`, PORTFOLIO_URL).href;

// Small line icons for the rows: a card, a chat, a play button, a window, a screen.
function RowIcon({ name }) {
  const paths = {
    card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
    chat: <><path d="M4 5h16v10H9l-5 4Z" /><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" /></>,
    play: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10.5 9.5 4 2.5-4 2.5Z" /></>,
    window: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M3 8.5h18M6.5 6.5h.01M9 6.5h.01" /></>,
    screen: <><rect x="3" y="7" width="18" height="12.5" rx="2.5" /><path d="m8.5 3 3.5 4 3.5-4" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// What's on the portfolio, in its words, each row opening its section there.
const WORK = [
  ["card", "Payment infrastructure", "Production payment services, and a payment gateway with two npm SDKs.", "experience"],
  ["chat", "AI automations", "Assistants that answer a small business's WhatsApp and Instagram enquiries day and night.", "studio"],
  ["play", "Product videos", "Launch, demo and social videos that show what an app does in under thirty seconds.", "studio"],
  ["window", "Apps like this one", "Desktop apps, AI tools and dashboards, DeskCharm among them.", "projects"],
];

export default function Maker() {
  return (
    <section className="block tight-top" id="maker">
      <div className="wrap maker-wrap">
        <div>
          <SectionIntro
            kicker="Made by Akshay."
            title={<>Hi, I'm Akshay. <em className="s">I make things like this.</em></>}
            lede="I'm a software engineer building payment infrastructure. Through my studio I also make AI automations and product videos for businesses. It's all on my portfolio."
          />
          <div className="maker-actions">
            <a className="btn btn-dark" href={PORTFOLIO_URL} {...external}>See my portfolio<ExternalIcon /></a>
            <a className="maker-link" href={portfolio("contact")} {...external}>Get in touch</a>
          </div>
        </div>
        <div className="folio-card">
          <div className="folio-head">
            <span className="folio-mono" aria-hidden="true">AK</span>
            <div><b>Akshay Kumar Singh</b><span>Software engineer · India</span></div>
          </div>
          <ul>
            {WORK.map(([icon, title, text, section]) => (
              <li key={title}>
                <a href={portfolio(section)} {...external}>
                  <span className="folio-icon"><RowIcon name={icon} /></span>
                  <b>{title}</b>
                  <span className="folio-text">{text}</span>
                  <ExternalIcon />
                </a>
              </li>
            ))}
          </ul>
          {/* Before You Merge, set a little apart from the work: something to explore, not a pitch. */}
          <a className="folio-explore" href={YOUTUBE_URL} {...external}>
            <span className="folio-icon"><RowIcon name="screen" /></span>
            <span className="folio-explore-text">
              <b>Before You Merge</b>
              <span>How the apps you use every day really work.</span>
            </span>
            <span className="folio-explore-go">Explore the channel<ExternalIcon /></span>
          </a>
          <a className="folio-foot" href={PORTFOLIO_URL} {...external}>See the whole portfolio<ExternalIcon /></a>
        </div>
      </div>
    </section>
  );
}
