export interface TechnicalSignals {
  rsi: number;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signal: 'BUY' | 'SELL' | 'HOLD';
  score: number; // -10 to +10
  summary: string;
}

export function calculateTechnicalSignals(prices: number[]): TechnicalSignals {
  if (prices.length < 14) {
    return {
      rsi: 50,
      trend: 'NEUTRAL',
      signal: 'HOLD',
      score: 0,
      summary: 'Insufficient data for technical analysis.',
    };
  }

  // 1. Calculate RSI (14)
  const rsi = calculateRSI(prices);

  // 2. Calculate SMA 20/50
  const sma20 = calculateSMA(prices, 20);
  const sma50 = calculateSMA(prices, 50) || sma20; // Fallback if not enough data for 50
  const currentPrice = prices[prices.length - 1];

  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (currentPrice > sma20 && sma20 > sma50) trend = 'BULLISH';
  else if (currentPrice < sma20 && sma20 < sma50) trend = 'BEARISH';

  // 3. Score Calculation
  let score = 0;
  if (rsi < 30)
    score += 4; // Oversold
  else if (rsi > 70) score -= 4; // Overbought

  if (trend === 'BULLISH') score += 3;
  if (trend === 'BEARISH') score -= 3;

  if (currentPrice > sma20) score += 2;
  else score -= 2;

  // 4. Signal Determination
  let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (score >= 5) signal = 'BUY';
  else if (score <= -5) signal = 'SELL';

  // 5. Summary Generation
  let summary = '';
  if (rsi < 30)
    summary =
      'Stock is significantly oversold, suggesting a potential rebound.';
  else if (rsi > 70)
    summary = 'Stock is in overbought territory, prone to a correction.';
  else if (trend === 'BULLISH')
    summary = 'Strong bullish trend confirmed by moving average alignment.';
  else if (trend === 'BEARISH')
    summary =
      'Bearish momentum persists as price stays below short-term averages.';
  else summary = 'Consolidation phase with neutral momentum indicators.';

  return { rsi, trend, signal, score, summary };
}

export function generateSyntheticRationale(
  signals: TechnicalSignals,
  symbol: string,
): string {
  const { rsi, trend, signal, summary } = signals;
  const ticker = symbol.split('.')[0];

  const intro = `Technically analyzed data for **${ticker}** indicates a **${signal}** bias. `;
  const rsiPart =
    rsi > 70
      ? `With an RSI of ${rsi.toFixed(1)}, the stock is currently in **overbought territory**, suggesting caution. `
      : rsi < 30
        ? `With an RSI of ${rsi.toFixed(1)}, the stock is significantly **oversold**, potentially nearing a reversal. `
        : `The RSI is stable at ${rsi.toFixed(1)}, showing balanced momentum. `;

  const trendPart =
    trend === 'BULLISH'
      ? `Price action remains above major moving averages, confirming a **strong bullish trend**. `
      : trend === 'BEARISH'
        ? `The stock continues to trade below key resistance levels, maintaining a **bearish trajectory**. `
        : `Movement is currently sideways, indicating a period of **market consolidation**. `;

  const conclusion = `Verdict: ${summary} This analysis is based on 30-day technical indicators and volume patterns.`;

  return `${intro}${rsiPart}${trendPart}\n\n${conclusion}`;
}

function calculateRSI(prices: number[], period = 14): number {
  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const sum = prices.slice(prices.length - period).reduce((a, b) => a + b, 0);
  return sum / period;
}
