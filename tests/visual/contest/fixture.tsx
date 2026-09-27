import React from "react";
import { createRoot } from "react-dom/client";
import ContestEntrantPhoto from "../../../client/src/components/ContestEntrantPhoto";
import { scenarios } from "./fixtures";
import "../../../client/src/index.css";

const theme = new URLSearchParams(location.search).get("theme")!;
createRoot(document.getElementById("root")!).render(
  <main>
    <h1>{theme} — isolated contest visual fixtures</h1>
    {scenarios.map(scenario => (
      <section key={scenario.id} data-scenario={scenario.id}>
        <h2>{scenario.id}</h2>
        <div className="fixture-pair">
          <ContestEntrantPhoto {...scenario} theme={theme === "none" ? null : theme}
            photoUrl={scenario.photo ? `/photo-${scenario.photo}.png` : null} />
          <img className="social" alt={`Social card: ${scenario.name}`} src={`/social/${theme}/${scenario.id}.jpg`} />
        </div>
      </section>
    ))}
  </main>,
);