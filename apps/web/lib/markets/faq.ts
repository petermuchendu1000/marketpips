// lib/markets/faq.ts
// Server-safe FAQ builder shared by the market page (server component, for the
// FAQPage JSON-LD) and the MarketFaq client accordion. Kept in a plain module
// (no 'use client') so the server can call it directly — a client-module export
// cannot be invoked from the server.

export type FaqItem = { q: string; a: string }

/** Build the market's FAQ from its own data. Pure — safe on server or client. */
export function buildMarketFaq(input: {
  title: string
  isMulti: boolean
  outcomeCount: number
  closesLabel: string
  feePct: string
}): FaqItem[] {
  const { title, isMulti, outcomeCount, closesLabel, feePct } = input
  return [
    {
      q: `What does "${title}" mean?`,
      a: isMulti
        ? `This is a multiple-choice prediction market with ${outcomeCount} possible outcomes. Each outcome trades as its own probability between 0% and 100%; you buy shares in the outcome you believe is most likely.`
        : `This is a Yes/No prediction market. The price of Yes reflects the market's estimated probability of the event happening — a price of 65¢ implies roughly a 65% chance. Buying Yes profits if the event occurs; buying No profits if it does not.`,
    },
    {
      q: 'How do I place a bet on MarketPips?',
      a: 'Pick an outcome, enter how much you want to stake, and confirm. Prices are set automatically by our LMSR market maker, so your order always fills — larger orders move the price along the curve. You can fund your wallet with M-Pesa, MTN MoMo, Airtel Money, or PesaPal.',
    },
    {
      q: 'When and how will this market resolve?',
      a: `Trading closes on ${closesLabel}. After the outcome is known, the market is resolved against the verifiable source listed in the Rules tab. Winning shares each pay out 1 unit; losing shares expire worthless.`,
    },
    {
      q: 'What fees does MarketPips charge?',
      a: `A ${feePct} platform fee is applied per trade, a small portion of which is shared with the market creator. There are no hidden spreads — the price you see from the market maker is the price you trade at.`,
    },
    {
      q: 'Can I sell before the market resolves?',
      a: 'Yes. Positions are tradable at any time while the market is open. You can sell some or all of your shares back to the market maker at the current price to lock in profit or cut a loss before resolution.',
    },
  ]
}
