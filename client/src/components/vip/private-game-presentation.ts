// Presentation-only overrides for the private srcDoc. Keep the server's game
// document, scripts, sandbox and Phaser's 540 × 960 FIT configuration intact.
const privateGameStyles = `
  html, body { background: #090510; }
  .arcade-room { height: 100%; padding: 0; }
  .arcade-cabinet {
    max-width: none;
    max-height: none;
    border: 0;
    border-radius: 0;
    background: #090510;
    box-shadow: none;
  }
  .arcade-marquee { display: none; }
  .crt-bezel { padding: 0; background: #090510; }
  .crt-screen-frame {
    border: 0;
    border-radius: 0;
    background: #090510;
    box-shadow: none;
  }
  #game-container canvas { border-radius: 0; }
  .arcade-deck {
    gap: 8px;
    padding: 0 8px;
    border: 0;
    background: #090510;
  }
  .coin-slot-badge { display: none; }
  .deck-instructions { text-align: left; }
  .arcade-mini-btn {
    min-width: 44px;
    min-height: 44px;
    border: 0;
    background: transparent;
  }
  .arcade-mini-btn:focus-visible {
    outline: 2px solid var(--cabinet-cyan);
    outline-offset: -3px;
  }
`;

export function withPrivateGamePresentation(html: string): string {
  // Insert after the original styles so cabinet framing is removed at every
  // breakpoint, without modifying gameplay code or reaching into the sandbox.
  return html.replace(/<\/head>/i, `<style>${privateGameStyles}</style></head>`);
}
