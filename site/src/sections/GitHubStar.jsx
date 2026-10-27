import { useEffect, useState } from "react";
import { GITHUB_REPO, GITHUB_URL } from "../config.js";
import { GitHubIcon, StarIcon } from "../components/Icons.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import "./GitHubStar.css";

const external = { target: "_blank", rel: "noopener noreferrer" };

// The repo's star count, live from GitHub. Stays null if GitHub can't be
// reached or its hourly limit for this visitor is used up; it just isn't shown.
function useStars() {
  const [stars, setStars] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then(r => r.ok ? r.json() : null)
      .then(repo => { if (live && Number.isFinite(repo?.stargazers_count)) setStars(repo.stargazers_count); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return stars;
}

export default function GitHubStar() {
  const stars = useStars();
  const [owner, name] = GITHUB_REPO.split("/");
  return (
    <section className="block tight-top" id="github">
      <div className="wrap">
        <div className="github-star">
          <div>
            <SectionIntro
              kicker="Like it? Star it."
              title={<>Enjoying DeskCharm? <em className="s">Give it a star.</em></>}
              lede="DeskCharm is free, and its code is right there on GitHub. A star takes one click, helps other Mac users find it, and tells me the next hero is worth making."
            />
            <div className="github-star-actions">
              <a className="btn btn-dark btn-star" href={GITHUB_URL} {...external}>
                <StarIcon />Star on GitHub
                {stars != null && <span className="star-count">{stars.toLocaleString()}</span>}
              </a>
              <span className="github-star-note">Needs a free GitHub account.</span>
            </div>
            <p className="github-star-issue">Found a bug or want a new hero? <a href={`${GITHUB_URL}/issues/new`} {...external}>Open an issue</a>.</p>
          </div>
          <a className="repo-card" href={GITHUB_URL} {...external} aria-label={`${GITHUB_REPO} on GitHub`}>
            <div className="repo-head">
              <GitHubIcon />
              <span>{owner} / <b>{name}</b></span>
              <em>Public</em>
            </div>
            <p>A macOS menu bar desk toy: a charm hangs from the top of your screen on a gold chain and swings with real rope physics.</p>
            <div className="repo-foot">
              <span className="repo-lang"><i />Swift</span>
              {stars != null && <span className="repo-stars"><StarIcon />{stars.toLocaleString()}</span>}
              <span className="repo-star-btn"><StarIcon />Star</span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
