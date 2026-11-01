import { PORTFOLIO_URL } from "../config.js";
import { ExternalIcon } from "../components/Icons.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import "./Maker.css";

const external = { target: "_blank", rel: "noopener noreferrer" };
const portfolio = section => new URL(`#${section}`, PORTFOLIO_URL).href;

// What's on the portfolio, in its words, each row opening its section there.
const WORK = [
  ["Payment infrastructure", "Production payment services, and a payment gateway with two npm SDKs.", "experience"],
  ["AI automations", "Assistants that answer a small business's WhatsApp and Instagram enquiries day and night.", "studio"],
  ["Product videos", "Launch, demo and social videos that show what an app does in under thirty seconds.", "studio"],
  ["Apps like this one", "Desktop apps, AI tools and dashboards, DeskCharm among them.", "projects"],
];

export default function Maker() {
  return (
    <section className="block tight-top" id="maker">
      <div className="wrap maker-wrap">
        <div>
          <SectionIntro
            kicker="Made by Akshay."
            title={<>Hi, I'm Akshay. <em className="s">I make things like this.</em></>}
            lede="I'm a software developer building payment infrastructure and AI automation. Through my studio I also make AI automations and product videos for businesses. It's all on my portfolio."
          />
          <div className="maker-actions">
            <a className="btn btn-dark" href={PORTFOLIO_URL} {...external}>See my portfolio<ExternalIcon /></a>
            <a className="maker-link" href={portfolio("contact")} {...external}>Get in touch</a>
          </div>
        </div>
        <div className="folio-card">
          <div className="folio-head">
            <span className="folio-mono" aria-hidden="true">AK</span>
            <div><b>Akshay Kumar Singh</b><span>Software Developer · Payment Infrastructure &amp; AI automation</span></div>
          </div>
          <ul>
            {WORK.map(([title, text, section]) => (
              <li key={title}><a href={portfolio(section)} {...external}><b>{title}</b><span>{text}</span><ExternalIcon /></a></li>
            ))}
          </ul>
          <a className="folio-foot" href={PORTFOLIO_URL} {...external}>See the whole portfolio<ExternalIcon /></a>
        </div>
      </div>
    </section>
  );
}
