/** Pure renderer: preserve the existing signed link and sender configuration. */
export function rescuePackInvitation(rescueName: string, link: string) {
  const name = rescueName.replace(/[\r\n]+/g, ' ').trim() || 'Your rescue';
  const escape = (value: string) => value.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const intro = `You’re receiving this invitation because you’re a Rescue Pack member supporting ${name}. We’ve invited you to try the games included with your existing membership.`;
  const games = 'Choose from Pasture Run, Rescue Shuffle 15, Rescue Triple Match, and Rescue Merge. No additional donation or purchase is required.';
  const security = 'This personal sign-in link expires in 24 hours. Please do not forward it. If it expires, visit the rescue’s Rescue Pack page to request a new access link.';
  return {
    subject: `${name} — your Rescue Pack games are ready`,
    html: `<p>${escape(intro)}</p><p>${games}</p><p><a href="${escape(link)}">Sign in to Rescue Pack and choose a game</a></p><p>${security}</p><p>Thank you for supporting ${escape(name)} and the animals in our care.</p>`,
    text: `${intro}\n\n${games}\n\nSign in to Rescue Pack and choose a game:\n${link}\n\n${security}\n\nThank you for supporting ${name} and the animals in our care.`,
  };
}
