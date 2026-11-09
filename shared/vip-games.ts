export const VIP_GAMES = [
  { id: 'pasture-run', name: 'Pasture Run', description: 'Jump into a rescue-themed horse-running adventure.' },
  { id: 'rescue-shuffle', name: 'Rescue Shuffle 15', description: 'Slide the numbered tiles to reveal one of your rescue’s available animals.' },
  { id: 'rescue-triple-match', name: 'Rescue Triple Match', description: 'Collect three matching animal tiles before your seven-slot dock fills up.' },
  { id: 'rescue-merge', name: 'Rescue Merge', description: 'Drop animal bubbles and merge matching pairs into bigger bubbles.' },
] as const;

export type VipGameId = typeof VIP_GAMES[number]['id'];
