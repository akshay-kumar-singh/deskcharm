import Brand from "../components/Brand.jsx";
import { PORTFOLIO_URL } from "../config.js";
import "./Footer.css";

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="footer-brand">
          <Brand />
          <p>Made by <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">Akshay Kumar Singh</a></p>
        </div>
        <p>Charm artwork from Hangly by sharancreatedthis. Spider-Man, the Hulk, Thor, Venom, Captain America and Iron Man are Marvel characters; Batman, Superman, Wonder Woman, The Flash and Green Lantern are DC characters. DeskCharm isn't affiliated with or endorsed by any of them.</p>
      </div>
    </footer>
  );
}
