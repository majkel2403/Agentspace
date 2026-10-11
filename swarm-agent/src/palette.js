// Colours of the swarm. The queen is always the accent pink; the other agents take the colours in the order they
// were spawned, so the same run always paints the same agent the same colour in the scene and in the deck.
// The five dark-mode colours are the ones validated for separation on #07040d (dataviz palette check).
export const QUEEN_COLOUR = '#ff2e6e';
export const AGENT_PALETTE = ['#3987e5', '#d95926', '#199e70', '#9085e9', '#c98500', '#5fb3c8', '#e06fa8'];

export function colourOf(id, order, queen = 'queen') {
  if (id === queen) return QUEEN_COLOUR;
  const i = order.filter((x) => x !== queen).indexOf(id);
  return i < 0 ? '#8c7fb8' : AGENT_PALETTE[i % AGENT_PALETTE.length];
}
