import { useState, useEffect, useRef, useCallback } from "react";

// ─── Mock Data Engine ────────────────────────────────────────────────────────

const EVENTS = [
  { id: "e1", title: "Fed Rate Decision – July 2025", market: "Kalshi", category: "Economics" },
  { id: "e2", title: "Trump Approval > 50% by Q3", market: "Polymarket", category: "Politics" },
  { id: "e3", title: "BTC > $120k by Dec 2025", market: "Kalshi", category: "Crypto" },
  { id: "e4", title: "US Recession in 2025", market: "Manifold", category: "Economics" },
  { id: "e5", title: "SpaceX Starship Orbital – 2025", market: "Polymarket", category: "Science" },
];

const FLAG_TYPES = [
  { code: "STR", label: "Structuring", color: "#e74c3c", severity: "CRITICAL" },
  { code: "VEL", label: "Velocity/Pass-Through", color: "#e67e22", severity: "HIGH" },
  { code: "NST", label: "Nested Transaction", color: "#c0392b", severity: "CRITICAL" },
  { code: "MKR", label: "Marker Manipulation", color: "#e74c3c", severity: "HIGH" },
  { code: "SAR", label: "SAR Trigger ($5k+)", color: "#8e44ad", severity: "CRITICAL" },
  { code: "3RD", label: "Third-Party Cashout", color: "#e67e22", severity: "HIGH" },
  { code: "IDX", label: "ID Anomaly", color: "#d35400", severity: "MEDIUM" },
];

const NAMES = ["K. Ramsey","J. Voss","M. Okafor","T. Blanc","A. Reyes","D. Kohl","F. Nkosi","R. Strauss","L. Chen","P. Moreau"];

function randomBetween(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomAmount() {
  const base = randomBetween(800, 18000);
  return base;
}

function generateTransaction(id) {
  const amount = randomAmount();
  const flagged = Math.random() < 0.55;
  const flags = flagged
    ? Array.from({ length: randomBetween(1, 3) }, () => randomFrom(FLAG_TYPES))
        .filter((f, i, a) => a.findIndex(x => x.code === f.code) === i)
    : [];
  const event = randomFrom(EVENTS);
  return {
    id: `tx-${id}`,
    ts: Date.now() - randomBetween(0, 1800000),
    actor: randomFrom(NAMES),
    event,
    action: randomFrom(["BUY", "SELL", "CASHOUT", "DEPOSIT"]),
    amount,
    flags,
    structuring: amount > 9000 && amount < 10000 && flagged,
    riskScore: flagged ? randomBetween(55, 99) : randomBetween(5, 40),
    cluster: flagged && Math.random() < 0.4 ? `CLU-${randomBetween(1, 5)}` : null,
    related: flagged && Math.random() < 0.3 ? randomFrom(NAMES) : null,
  };
}

let txCounter = 1000;
function generateBatch(n = 12) {
  return Array.from({ length: n }, () => generateTransaction(txCounter++));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUSD(n) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function riskColor(score) {
  if (score >= 80) return "#e74c3c";
  if (score >= 60) return "#e67e22";
  if (score >= 40) return "#f1c40f";
  return "#2ecc71";
}

// ─── Components ──────────────────────────────────────────────────────────────

function RiskGauge({ score }) {
  const angle = (score / 100) * 180 - 90;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="80" height="44" viewBox="0 0 80 44">
        <path d="M8 40 A 32 32 0 0 1 72 40" fill="none" stroke="#1a2035" strokeWidth="8" strokeLinecap="round" />
        <path d="M8 40 A 32 32 0 0 1 72 40" fill="none" stroke={riskColor(score)} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${(score / 100) * 100.5} 100.5`} />
        <g transform={`translate(40,40) rotate(${angle})`}>
          <line x1="0" y1="0" x2="0" y2="-26" stroke={riskColor(score)} strokeWidth="2" strokeLinecap="round" />
          <circle cx="0" cy="0" r="3" fill={riskColor(score)} />
        </g>
      </svg>
      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: riskColor(score), fontWeight: 700 }}>
        {score} <span style={{ color: "#5a6a8a", fontSize: 10 }}>/ 100</span>
      </span>
    </div>
  );
}

function FlagBadge({ flag }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: flag.color + "22", border: `1px solid ${flag.color}66`,
      color: flag.color, borderRadius: 4, padding: "2px 7px",
      fontSize: 10, fontFamily: "'Courier Prime', monospace", fontWeight: 700,
      letterSpacing: "0.05em"
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: flag.color, display: "inline-block" }} />
      {flag.code}
    </span>
  );
}

function Ticker({ transactions }) {
  const flagged = transactions.filter(t => t.flags.length > 0).slice(0, 30);
  return (
    <div style={{ height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #1a2545" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e74c3c", display: "inline-block", boxShadow: "0 0 8px #e74c3c" }} className="pulse-dot" />
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: "#8899bb", letterSpacing: "0.12em", textTransform: "uppercase" }}>Live Activity Feed</span>
        </div>
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#3a4a6a", marginTop: 4 }}>
          {flagged.length} flagged · {transactions.length} total
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {flagged.map((tx, i) => (
          <TickerRow key={tx.id} tx={tx} fresh={i === 0} />
        ))}
      </div>
    </div>
  );
}

function TickerRow({ tx, fresh }) {
  return (
    <div style={{
      padding: "10px 16px",
      borderBottom: "1px solid #0e1525",
      background: fresh ? "#0e1a2e" : "transparent",
      cursor: "pointer",
      transition: "background 0.3s",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: "#c8d8f0", fontStyle: "italic" }}>{tx.actor}</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: tx.structuring ? "#e74c3c" : "#c9a227", fontWeight: 700 }}>
          {fmtUSD(tx.amount)}
        </span>
      </div>
      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#3a5080", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {tx.event.title}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
        {tx.flags.slice(0, 3).map(f => <FlagBadge key={f.code} flag={f} />)}
      </div>
      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#253555", marginTop: 4 }}>
        {fmtTime(tx.ts)} · {tx.action} · {tx.event.market}
      </div>
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#5a7090" }}>{label}</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: color }}>{value}</span>
      </div>
      <div style={{ height: 3, background: "#0e1525", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function DeepDive({ transactions }) {
  const eventGroups = {};
  transactions.forEach(tx => {
    const eid = tx.event.id;
    if (!eventGroups[eid]) eventGroups[eid] = { event: tx.event, txs: [], totalVolume: 0, flagCount: 0 };
    eventGroups[eid].txs.push(tx);
    eventGroups[eid].totalVolume += tx.amount;
    if (tx.flags.length) eventGroups[eid].flagCount++;
  });

  const sorted = Object.values(eventGroups).sort((a, b) => b.flagCount - a.flagCount);
  const [selected, setSelected] = useState(null);
  const focus = selected ? eventGroups[selected] : sorted[0];

  const flagBreakdown = {};
  if (focus) {
    focus.txs.forEach(tx => tx.flags.forEach(f => { flagBreakdown[f.code] = (flagBreakdown[f.code] || 0) + 1; }));
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #1a2545" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: "#8899bb", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
          Deep Dive · Event Analysis
        </div>
        {/* Event selector pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {sorted.map(g => (
            <button key={g.event.id} onClick={() => setSelected(g.event.id)}
              style={{
                padding: "3px 10px", borderRadius: 20, border: "1px solid",
                borderColor: (focus?.event.id === g.event.id) ? "#c9a227" : "#1a2545",
                background: (focus?.event.id === g.event.id) ? "#c9a22722" : "transparent",
                color: (focus?.event.id === g.event.id) ? "#c9a227" : "#3a5070",
                fontFamily: "'Courier Prime', monospace", fontSize: 10, cursor: "pointer",
                transition: "all 0.2s"
              }}>
              {g.event.market}
            </button>
          ))}
        </div>
      </div>

      {focus && (
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {/* Event title */}
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#d4e4ff", fontWeight: 600, lineHeight: 1.3, marginBottom: 16 }}>
            {focus.event.title}
          </div>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Total Volume", value: fmtUSD(focus.totalVolume), color: "#c9a227" },
              { label: "Flagged Tx", value: focus.flagCount, color: "#e74c3c" },
              { label: "Risk Events", value: focus.txs.filter(t => t.riskScore >= 70).length, color: "#e67e22" },
            ].map(s => (
              <div key={s.label} style={{ background: "#080e1c", border: "1px solid #1a2545", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#3a5070", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: s.color, fontWeight: 700 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Flag breakdown */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#3a5070", marginBottom: 10, letterSpacing: "0.08em" }}>FLAG DISTRIBUTION</div>
            {Object.entries(flagBreakdown).map(([code, count]) => {
              const ft = FLAG_TYPES.find(f => f.code === code);
              return ft ? <MiniBar key={code} label={`${ft.code} · ${ft.label}`} value={count} max={focus.txs.length} color={ft.color} /> : null;
            })}
            {Object.keys(flagBreakdown).length === 0 && (
              <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "#2a3a5a" }}>No flags in current window</div>
            )}
          </div>

          {/* Top suspicious transactions */}
          <div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#3a5070", marginBottom: 10, letterSpacing: "0.08em" }}>HIGH-RISK TRANSACTIONS</div>
            {focus.txs.filter(t => t.riskScore >= 60).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5).map(tx => (
              <div key={tx.id} style={{
                background: "#080e1c", border: "1px solid #1a2545", borderRadius: 8, padding: "10px 14px", marginBottom: 8,
                borderLeft: `3px solid ${riskColor(tx.riskScore)}`
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 14, color: "#c8d8f0" }}>{tx.actor}</span>
                  <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#c9a227", fontWeight: 700 }}>{fmtUSD(tx.amount)}</span>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {tx.flags.map(f => <FlagBadge key={f.code} flag={f} />)}
                  <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#2a3a5a", marginLeft: "auto" }}>{tx.action} · {fmtTime(tx.ts)}</span>
                </div>
                {tx.cluster && (
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#8e44ad", marginTop: 4 }}>
                    ⬡ Cluster: {tx.cluster} {tx.related ? `· linked: ${tx.related}` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RedFlagPanel({ transactions }) {
  const counts = {};
  FLAG_TYPES.forEach(f => { counts[f.code] = 0; });
  transactions.forEach(tx => tx.flags.forEach(f => { counts[f.code] = (counts[f.code] || 0) + 1; }));

  const totalVolumeFlagged = transactions.filter(t => t.flags.length).reduce((s, t) => s + t.amount, 0);
  const sarEligible = transactions.filter(t => t.flags.length && t.amount >= 5000).length;
  const ctrEligible = transactions.filter(t => t.amount > 10000).length;
  const structuring = transactions.filter(t => t.structuring).length;
  const clusters = new Set(transactions.map(t => t.cluster).filter(Boolean));

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #1a2545" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: "#8899bb", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Regulatory Checklist
        </div>
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Summary metrics */}
        <div style={{ marginBottom: 18 }}>
          {[
            { label: "SAR-Eligible Events", value: sarEligible, color: "#8e44ad", threshold: "≥ $5,000" },
            { label: "CTR Threshold Hits", value: ctrEligible, color: "#e74c3c", threshold: "> $10,000" },
            { label: "Structuring Detected", value: structuring, color: "#e74c3c", threshold: "<$10k avoidance" },
            { label: "Nested Clusters", value: clusters.size, color: "#e67e22", threshold: "30-day window" },
          ].map(m => (
            <div key={m.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#080e1c", border: `1px solid ${m.value > 0 ? m.color + "44" : "#1a2545"}`,
              borderRadius: 6, padding: "8px 12px", marginBottom: 8
            }}>
              <div>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: m.value > 0 ? m.color : "#3a5070" }}>{m.label}</div>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#253555" }}>{m.threshold}</div>
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: m.value > 0 ? m.color : "#2a3a5a", fontWeight: 700 }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* FinCEN indicators */}
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#3a5070", marginBottom: 10, letterSpacing: "0.08em" }}>FINCEN INDICATOR MATRIX</div>
        {FLAG_TYPES.map(f => (
          <div key={f.code} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "7px 0", borderBottom: "1px solid #0e1525"
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: counts[f.code] > 0 ? f.color : "#1a2545", display: "inline-block" }} />
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: counts[f.code] > 0 ? "#c8d8f0" : "#2a3a5a" }}>{f.label}</span>
              </div>
              <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#1e2e48", marginLeft: 12 }}>{f.severity}</div>
            </div>
            <div style={{
              fontFamily: "'Courier Prime', monospace", fontSize: 14, fontWeight: 700,
              color: counts[f.code] > 0 ? f.color : "#1e2e48"
            }}>
              {counts[f.code]}
            </div>
          </div>
        ))}

        {/* Total volume */}
        <div style={{ marginTop: 16, background: "#080e1c", border: "1px solid #c9a22733", borderRadius: 6, padding: "12px" }}>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 9, color: "#5a6a4a", letterSpacing: "0.08em" }}>TOTAL FLAGGED VOLUME</div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#c9a227", fontWeight: 700, marginTop: 4 }}>{fmtUSD(totalVolumeFlagged)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function LeadSeer() {
  const [transactions, setTransactions] = useState(() => generateBatch(20));
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      const newTx = generateBatch(randomBetween(1, 3));
      setTransactions(prev => [...newTx, ...prev].slice(0, 120));
      setTick(t => t + 1);
    }, 2800);
    return () => clearInterval(id);
  }, [paused]);

  const flaggedCount = transactions.filter(t => t.flags.length > 0).length;
  const criticalCount = transactions.filter(t => t.riskScore >= 80).length;

  return (
    <div style={{
      minHeight: "100vh", background: "#05080f",
      fontFamily: "'Courier Prime', monospace",
      color: "#c8d8f0",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Courier+Prime:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; scrollbar-width: thin; scrollbar-color: #1a2545 transparent; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a2545; border-radius: 2px; }
        button { cursor: pointer; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .pulse-dot { animation: pulse 1.5s ease infinite; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Header */}
      <header style={{
        background: "#06090f", borderBottom: "1px solid #1a2545",
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Magnifying glass logo */}
          <svg width="36" height="36" viewBox="0 0 36 36">
            <circle cx="14" cy="14" r="9" fill="none" stroke="#c9a227" strokeWidth="2.5" />
            <circle cx="14" cy="14" r="5" fill="none" stroke="#c9a22755" strokeWidth="1" />
            <line x1="20.5" y1="20.5" x2="31" y2="31" stroke="#c9a227" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="14" cy="14" r="2" fill="#c9a22744" />
          </svg>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, color: "#d4e8ff", letterSpacing: "0.05em" }}>
              LeadSeer
            </div>
            <div style={{ fontSize: 9, color: "#3a5070", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Unusual Activity Monitor
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { label: "Flagged", value: flaggedCount, color: "#e74c3c" },
              { label: "Critical", value: criticalCount, color: "#8e44ad" },
              { label: "Total", value: transactions.length, color: "#c9a227" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: s.color, fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: 9, color: "#3a5070", letterSpacing: "0.1em" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setPaused(p => !p)} style={{
            padding: "6px 14px", borderRadius: 4,
            border: `1px solid ${paused ? "#2ecc71" : "#e74c3c"}`,
            background: paused ? "#2ecc7122" : "#e74c3c22",
            color: paused ? "#2ecc71" : "#e74c3c",
            fontFamily: "'Courier Prime', monospace", fontSize: 10, letterSpacing: "0.1em",
            transition: "all 0.2s"
          }}>
            {paused ? "▶ RESUME" : "⏸ PAUSE"}
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: "280px 1fr 240px",
        height: "calc(100vh - 64px)",
        overflow: "hidden"
      }}>
        {/* Left – Ticker */}
        <div style={{ borderRight: "1px solid #1a2545", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Ticker transactions={transactions} key={tick} />
        </div>

        {/* Center – Deep Dive */}
        <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", background: "#060912" }}>
          <DeepDive transactions={transactions} />
        </div>

        {/* Right – Red Flag Panel */}
        <div style={{ borderLeft: "1px solid #1a2545", overflow: "hidden" }}>
          <RedFlagPanel transactions={transactions} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: "#06090f", borderTop: "1px solid #1a2545",
        padding: "6px 24px", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <span style={{ fontSize: 9, color: "#253555" }}>FinCEN-aligned · CTR $10k · SAR $5k · 30-day window</span>
        <span style={{ fontSize: 9, color: "#253555" }}>
          <span style={{ color: paused ? "#e74c3c" : "#2ecc71" }}>●</span> {paused ? "PAUSED" : "LIVE"} · {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
