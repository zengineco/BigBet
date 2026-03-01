# BigBet — Unusual Activity Monitor
### FinCEN-Aligned Prediction Market Surveillance Dashboard

---

## Overview

BigBet is a real-time, single-page application that ingests prediction market data from platforms like **Polymarket** and **Kalshi**, applies FinCEN-aligned detection logic, and surfaces "unusual activity" matching money laundering, structuring, and fraud indicators. It is designed for financial analysts, compliance teams, and researchers tracking suspicious behavioral patterns in prediction markets.

---

## Quick Start (Local Dev)

### Prerequisites
- Node.js v18+
- npm or yarn

### 1. Clone & Install
```bash
git clone https://github.com/yourorg/bigbet.git
cd bigbet
npm install
```

### 2. Create `.env.local`
```env
VITE_POLYMARKET_GAMMA=https://gamma-api.polymarket.com
VITE_POLYMARKET_DATA=https://data-api.polymarket.com
VITE_KALSHI_API=https://trading-api.kalshi.com/trade-api/v2
# Optional — for authenticated endpoints
VITE_POLYMARKET_API_KEY=your_key_here
VITE_KALSHI_EMAIL=your@email.com
VITE_KALSHI_PASSWORD=yourpassword
```

### 3. Run
```bash
npm run dev
# → http://localhost:5173
```

---

## Deployment

### Vercel (Recommended)
```bash
npm install -g vercel
vercel --prod
```
Set environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**.

### Netlify
```bash
npm run build
netlify deploy --prod --dir=dist
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npx", "serve", "dist", "-p", "3000"]
```
```bash
docker build -t bigbet .
docker run -p 3000:3000 bigbet
```

---

## Data Sources

### Currently Integrated

| Platform | Type | API Endpoint | Auth Required |
|---|---|---|---|
| **Polymarket** | Public REST | `gamma-api.polymarket.com` | No (public) |
| **Polymarket** | Data API | `data-api.polymarket.com` | No (public) |
| **Kalshi** | REST v2 | `trading-api.kalshi.com` | Yes (account) |

### How Real-Time Data Works

The app polls `gamma-api.polymarket.com/markets` every 90 seconds to fetch the top markets by 24-hour volume. Markets with abnormally high volume relative to their typical baseline are automatically flagged for unusual activity analysis. On-chain transaction hashes are linked back to Polymarket's Data API for trade-level detail.

### Other Markets You Can Add (Easy)

1. **Manifold Markets** — Free public API, no auth
   - Base: `https://api.manifold.markets/v0`
   - Endpoint: `/markets?limit=100&sort=last-bet-time`
   
2. **Metaculus** — Public API
   - Base: `https://www.metaculus.com/api2`
   - Endpoint: `/questions/?format=json&limit=50`
   
3. **PredictIt** — Public market data
   - Base: `https://www.predictit.org/api/marketdata`
   - Endpoint: `/all/`

4. **Kalshi US** (with auth)
   - Register at kalshi.com → API keys in account settings
   - POST `/login` → use JWT in `Authorization: Bearer` header

---

## Architecture

```
src/
├── BigBet.jsx            ← Main SPA (all-in-one for Claude artifact)
├── components/
│   ├── Ticker.jsx        ← Left: Live flagged transactions feed
│   ├── DeepDive.jsx      ← Center: Per-event analysis panel
│   ├── RegPanel.jsx      ← Right: FinCEN compliance checklist
│   ├── FilterBar.jsx     ← Bottom: Quick filter + advanced settings
│   └── Logo.jsx          ← BB animated logo
├── engine/
│   ├── flagEngine.js     ← FinCEN detection logic
│   ├── polymarket.js     ← Polymarket API integration
│   ├── kalshi.js         ← Kalshi API integration
│   └── filters.js        ← Filter/sort logic
└── hooks/
    ├── useLiveFeed.js    ← Polling + WebSocket management
    └── useFilters.js     ← Filter state management
```

---

## FinCEN Detection Logic

### Implemented Indicators

| Code | Indicator | Trigger Condition |
|---|---|---|
| `STR` | Structuring / Smurfing | Amount $9,000–$9,999 with high-frequency follow-on trades |
| `VEL` | Velocity / Pass-Through | Deposit → cashout within 60s with <5% play activity |
| `NST` | Nested Transactions | Related wallets splitting amounts across 30-day window |
| `MKR` | Marker Manipulation | $20k+ payoffs fragmented into sub-$3k transactions in 7 days |
| `SAR` | SAR Trigger | Any suspicious pattern ≥ $5,000 |
| `3RD` | Third-Party Cashout | Winnings routed to a different wallet/actor |
| `IDX` | ID Anomaly | Similar pseudonyms or wallet prefixes acting in concert |

### Expanding Detection Logic
Add new flag types in `flagEngine.js`:
```js
export function detectFlags(transaction, history) {
  const flags = [];
  
  // Add your custom indicator:
  if (transaction.amount > 15000 && transaction.action === "CASHOUT") {
    const recentDeposit = history.find(t =>
      t.actor === transaction.actor &&
      t.action === "DEPOSIT" &&
      Date.now() - t.ts < 300000 // 5 min
    );
    if (recentDeposit) flags.push(FLAG_TYPES.find(f => f.code === "VEL"));
  }
  
  return flags;
}
```

---

## Customization

### Branding
Update the `BB_Logo` component in `BigBet.jsx` to use your PNG:
```jsx
function BB_Logo({ size = 40 }) {
  return <img src="/logo.png" width={size} height={size} alt="BigBet" style={{borderRadius:"50%"}} />;
}
```

### Color Scheme (CSS Variables)
Edit the `COLORS` object at the top of `BigBet.jsx`:
```js
const COLORS = {
  bg:      "#04060d",   // main background
  panel:   "#070b14",   // panel/sidebar background
  gold:    "#c9a227",   // primary accent (amounts, headings)
  cyan:    "#00d4ff",   // secondary accent (live indicator)
  red:     "#ff4444",   // critical flags
  green:   "#00e676",   // clean / safe indicator
  text:    "#d4e8ff",   // primary text
  textMid: "#6a88b8",   // secondary text
  textLo:  "#2a3a5a",   // tertiary / label text ← RAISED from old dark values
};
```

### Add a New Market Source
```js
// In your polling hook or useEffect:
async function fetchKalshiMarkets() {
  const res = await fetch("https://trading-api.kalshi.com/trade-api/v2/markets?limit=50&status=open", {
    headers: { "Authorization": `Bearer ${import.meta.env.VITE_KALSHI_TOKEN}` }
  });
  const { markets } = await res.json();
  return markets.map(m => ({
    id: `kalshi-${m.ticker}`,
    ts: Date.now(),
    actor: "Kalshi Feed",
    event: { id: m.ticker, title: m.title, market: "Kalshi", cat: m.category },
    amount: m.volume || 0,
    action: "BUY",
    flags: m.volume > 100000 ? [FLAG_TYPES[1]] : [],
    riskScore: m.volume > 100000 ? 70 : 20,
    source: "kalshi",
    cluster: null, related: null, structuring: false,
  }));
}
```

---

## Filter System Reference

### Quick Filters (Bottom Bar)
| Filter | Description |
|---|---|
| `1h / 6h / 24h / all` | Time window for displayed transactions |
| `Latest` | Sort by most recent timestamp |
| `Risk↓` | Sort by risk score descending |
| `Amount↓` | Sort by transaction amount descending |
| `Flags↓` | Sort by number of active flags |
| `🚩 Flagged Only` | Show only transactions with ≥1 flag |

### Advanced Filters (⚙ Panel)
| Filter | Description |
|---|---|
| **Amount Range** | Slider + numeric inputs for min/max transaction size |
| **Min Risk Score** | Slider 0–100, filters to only high-risk events |
| **Include Flags** | Show ONLY transactions matching selected flag codes |
| **Exclude Flags** | Hide transactions with selected flag codes |
| **Action Type** | BUY / SELL / CASHOUT / DEPOSIT or ALL |
| **Market** | Polymarket / Kalshi / Manifold or ALL |
| **Flagged Only** | Toggle — same as quick bar shortcut |

---

## Regulatory Reference

- **CTR (Currency Transaction Report):** Mandatory for transactions > $10,000 cash
- **SAR (Suspicious Activity Report):** Required for suspicious transactions ≥ $5,000
- **Structuring threshold:** Splitting to avoid $10,000 CTR reporting
- **Wire threshold:** $3,000+ wire transfers require identity verification
- **FinCEN guidance:** https://www.fincen.gov/resources/statutes-regulations/guidance

> **Disclaimer:** BigBet is a data visualization and monitoring tool. It does not constitute legal, financial, or compliance advice. Actual SAR/CTR filings must be made by licensed compliance officers under applicable law.

---

## Roadmap

- [ ] WebSocket real-time Polymarket trade stream (CLOB API)
- [ ] Kalshi live market integration (authenticated)
- [ ] Wallet graph visualization (D3 force-directed, cluster mapping)
- [ ] Export flagged transactions as CSV / PDF report
- [ ] Alert system (email / SMS / webhook on critical flag)
- [ ] Historical backfill (30/60/90 day analysis)
- [ ] AI-assisted narrative ("Why is this flagged?")
- [ ] Multi-user roles (analyst / auditor / admin)

---

## License
MIT — Free to use, modify, and distribute.

---

*Built for compliance professionals and market researchers. BigBet is not affiliated with Polymarket, Kalshi, or FinCEN.*
