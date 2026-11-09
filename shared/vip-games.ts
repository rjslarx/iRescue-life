export const VIP_GAMES = [
  { id: 'pasture-run', name: 'Pasture Run', description: 'Jump into a rescue-themed horse-running adventure.' },
  { id: 'rescue-shuffle', name: 'Rescue Shuffle 15', description: 'Slide the numbered tiles to reveal one of your rescue’s available animals.' },
] as const;

export type VipGameId = typeof VIP_GAMES[number]['id'];
