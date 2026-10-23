import { useRef } from "react";
import { DownloadHelpProvider } from "./components/DownloadHelp.jsx";
import Nav from "./sections/Nav.jsx";
import Hero from "./sections/Hero/Hero.jsx";
import Stats from "./sections/Stats.jsx";
import Powers, { readPreview } from "./sections/Powers/Powers.jsx";
import Cast from "./sections/Cast.jsx";
import MakeYourOwn from "./sections/MakeYourOwn.jsx";
import Features from "./sections/Features.jsx";
import Install from "./sections/Install.jsx";
import Support from "./sections/Support/Support.jsx";
import Cta from "./sections/Cta.jsx";
import Footer from "./sections/Footer.jsx";

// #preview=thor:shake shows just the powers demo playing one effect.
const preview = readPreview();

export default function App() {
  const powers = useRef(null);
  if (preview) return <Powers preview={preview} />;
  return (
    <DownloadHelpProvider>
      <Nav />
      <Hero />
      <Stats />
      <Powers ref={powers} />
      <Cast onPick={(power, charmId) => powers.current.showcase(power, charmId)} />
      <MakeYourOwn />
      <Features />
      <Install />
      <Support />
      <Cta />
      <Footer />
    </DownloadHelpProvider>
  );
}
