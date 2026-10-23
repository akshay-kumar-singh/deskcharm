import { useEffect, useState } from "react";
import Brand from "../components/Brand.jsx";
import DownloadButton from "../components/DownloadButton.jsx";
import "./Nav.css";

const LINKS = [
  ["#powers", "Powers"],
  ["#cast", "Charms"],
  ["#make", "Make your own"],
  ["#install", "Install"],
  ["#support", "Buy me a coffee"],
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={scrolled ? "scrolled" : undefined}>
      <div className="wrap">
        <Brand />
        <div className="links">
          {LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </div>
        <DownloadButton icon={false}>Download</DownloadButton>
      </div>
    </nav>
  );
}
