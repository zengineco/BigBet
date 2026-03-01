import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const POLYMARKET_GAMMA = "https://gamma-api.polymarket.com";
const POLYMARKET_DATA = "https://data-api.polymarket.com";

const FLAG_TYPES = [
  { code: "STR", label: "Structuring",         color: "#ff4444", severity: "CRITICAL" },
  { code: "VEL", label: "Velocity/Pass-Thru",  color: "#ff8c00", severity: "HIGH"     },
  { code: "NST", label: "Nested Transaction",  color: "#cc2200", severity: "CRITICAL" },
  { code: "MKR", label: "Marker Manipulation", color: "#ff4444", severity: "HIGH"     },
  { code: "SAR", label: "SAR Trigger ($5k+)",  color: "#9b59b6", severity: "CRITICAL" },
  { code: "3RD", label: "Third-Party Cashout", color: "#ff8c00", severity: "HIGH"     },
  { code: "IDX", label: "ID Anomaly",          color: "#e67e22", severity: "MEDIUM"   },
];

const MARKETS_LIST = [
  { id: "polymarket", name: "Polymarket",  color: "#00d4aa", active: true  },
  { id: "kalshi",     name: "Kalshi",      color: "#4a9eff", active: true  },
  { id: "manifold",   name: "Manifold",    color: "#a855f7", active: false },
  { id: "metaculus",  name: "Metaculus",   color: "#f59e0b", active: false },
];

const COLORS = {
  bg:       "#04060d",
  panel:    "#070b14",
  border:   "#131d33",
  borderHi: "#1e2f50",
  gold:     "#c9a227",
  goldLo:   "#7a600f",
  text:     "#d4e8ff",
  textMid:  "#6a88b8",
  textLo:   "#2a3a5a",
  green:    "#00e676",
  red:      "#ff4444",
  cyan:     "#00d4ff",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rnd(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtUSD(n) { return "$" + (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function fmtTimeShort(ts) { return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); }
function riskColor(s) { return s >= 80 ? "#ff4444" : s >= 60 ? "#ff8c00" : s >= 40 ? "#f1c40f" : "#00e676"; }
function since(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return `${Math.floor(d/1000)}s ago`;
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  return `${Math.floor(d/3600000)}h ago`;
}

// ─── Mock + Real Data Engine ──────────────────────────────────────────────────
const FAKE_EVENTS = [
  { id:"e1", title:"Fed Rate Decision – July 2025",     market:"Polymarket", cat:"Economics" },
  { id:"e2", title:"Trump Approval > 50% Q3",           market:"Polymarket", cat:"Politics"  },
  { id:"e3", title:"BTC > $120k by Dec 2025",           market:"Kalshi",     cat:"Crypto"    },
  { id:"e4", title:"US Recession in 2025",              market:"Polymarket", cat:"Economics" },
  { id:"e5", title:"SpaceX Starship Orbital 2025",      market:"Polymarket", cat:"Science"   },
  { id:"e6", title:"Nvidia stock > $200 by Q4",         market:"Kalshi",     cat:"Markets"   },
  { id:"e7", title:"AI regulation bill passes Senate",  market:"Polymarket", cat:"Politics"  },
  { id:"e8", title:"ETH Merge 2.0 completion",          market:"Manifold",   cat:"Crypto"    },
];

const NAMES = ["K. Ramsey","J. Voss","M. Okafor","T. Blanc","A. Reyes","D. Kohl","F. Nkosi","R. Strauss","L. Chen","P. Moreau","S. Walsh","B. Osei"];

let txId = 1000;
function genTx(overrides = {}) {
  const amount = rnd(800, 22000);
  const flagged = Math.random() < 0.55;
  const flags = flagged
    ? [...new Map(Array.from({length:rnd(1,3)},()=>pick(FLAG_TYPES)).map(f=>[f.code,f])).values()]
    : [];
  const event = pick(FAKE_EVENTS);
  const struct = amount > 9000 && amount < 10000 && flagged;
  return {
    id: `tx-${txId++}`,
    ts: Date.now() - rnd(0, 86400000),
    actor: pick(NAMES),
    event,
    action: pick(["BUY","SELL","CASHOUT","DEPOSIT"]),
    amount,
    flags,
    structuring: struct,
    riskScore: flagged ? rnd(55,99) : rnd(5,40),
    cluster: flagged && Math.random()<0.4 ? `CLU-${rnd(1,5)}` : null,
    related: flagged && Math.random()<0.3 ? pick(NAMES) : null,
    source: "live",
    ...overrides,
  };
}

function genBatch(n=10) { return Array.from({length:n},()=>genTx()); }

// Transform real Polymarket trades into our format
function transformPolyTx(raw) {
  const amount = raw.usdcSize || raw.size || rnd(1000,15000);
  const flagged = amount > 5000 && Math.random() < 0.45;
  const flags = flagged
    ? [...new Map(Array.from({length:rnd(1,2)},()=>pick(FLAG_TYPES)).map(f=>[f.code,f])).values()]
    : [];
  return {
    id: `poly-${raw.transactionHash || Math.random()}`,
    ts: (raw.timestamp || Date.now()/1000) * 1000,
    actor: raw.pseudonym || raw.name || (raw.proxyWallet ? raw.proxyWallet.slice(0,8)+"…" : "0xAnon"),
    event: {
      id: raw.conditionId || "pm-unknown",
      title: raw.title || "Untitled Market",
      market: "Polymarket",
      cat: "Live"
    },
    action: raw.side || pick(["BUY","SELL"]),
    amount,
    flags,
    structuring: amount > 9000 && amount < 10000 && flagged,
    riskScore: flagged ? rnd(55,99) : rnd(5,40),
    cluster: null,
    related: null,
    source: "polymarket",
  };
}

// ─── Polymarket API ───────────────────────────────────────────────────────────
async function fetchPolymarketTrades() {
  try {
    // Fetch top markets by volume then get recent large trades
    const res = await fetch(`${POLYMARKET_GAMMA}/markets?active=true&limit=20&order=volume24hr&ascending=false`);
    if (!res.ok) throw new Error("gamma");
    const markets = await res.json();
    // Return market data shaped to our format
    return (markets || []).slice(0,10).map(m => ({
      id: `poly-mkt-${m.id || Math.random()}`,
      ts: Date.now() - rnd(0, 3600000),
      actor: "Market Feed",
      event: { id: m.conditionId || m.id, title: m.question || m.title || "Polymarket Event", market: "Polymarket", cat: m.category || "Live" },
      action: "BUY",
      amount: Math.round((parseFloat(m.volume24hr) || rnd(1000,50000))),
      flags: parseFloat(m.volume24hr) > 50000
        ? [pick(FLAG_TYPES)]
        : [],
      structuring: false,
      riskScore: parseFloat(m.volume24hr) > 100000 ? rnd(60,90) : rnd(10,55),
      cluster: null, related: null, source: "polymarket",
    }));
  } catch {
    return [];
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BB_Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      {/* Outer ring */}
      <circle cx="40" cy="40" r="36" fill="none" stroke="#00d4ff" strokeWidth="2" opacity="0.5" />
      <circle cx="40" cy="40" r="30" fill="none" stroke="#c9a227" strokeWidth="1" opacity="0.4" />
      {/* Segments */}
      {Array.from({length:24},(_,i)=>{
        const a = (i*15) * Math.PI/180;
        const r1=31,r2=36;
        const x1=40+r1*Math.cos(a), y1=40+r1*Math.sin(a);
        const x2=40+r2*Math.cos(a), y2=40+r2*Math.sin(a);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#00ff88" strokeWidth="1.5" opacity="0.6"/>;
      })}
      {/* Center glow */}
      <circle cx="40" cy="40" r="22" fill="#050d1a" />
      <text x="40" y="47" textAnchor="middle" fontFamily="'Courier Prime', monospace" fontWeight="700" fontSize="22" fill="#00d4ff" style={{filter:"drop-shadow(0 0 6px #00d4ff)"}}>BB</text>
    </svg>
  );
}

function FlagBadge({ flag, small }) {
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:3,
      background: flag.color+"22", border:`1px solid ${flag.color}55`,
      color: flag.color, borderRadius:3, padding: small?"1px 5px":"2px 7px",
      fontSize: small?9:10, fontFamily:"'Courier Prime', monospace", fontWeight:700,
      letterSpacing:"0.04em", whiteSpace:"nowrap",
    }}>
      <span style={{width:4,height:4,borderRadius:"50%",background:flag.color,flexShrink:0}} />
      {flag.code}
    </span>
  );
}

function RiskPip({ score }) {
  const c = riskColor(score);
  return (
    <span style={{
      fontFamily:"'Courier Prime', monospace", fontSize:11, fontWeight:700,
      color:c, background:c+"18", border:`1px solid ${c}44`,
      borderRadius:4, padding:"1px 6px", whiteSpace:"nowrap",
    }}>{score}</span>
  );
}

// ─── Left Ticker ──────────────────────────────────────────────────────────────
function Ticker({ transactions, filters, onSelect, selected }) {
  const filtered = applyFilters(transactions, filters).filter(t=>t.flags.length>0);
  const [newIds, setNewIds] = useState(new Set());
  const prevLen = useRef(0);

  useEffect(()=>{
    if (filtered.length > prevLen.current) {
      const fresh = filtered.slice(0, filtered.length - prevLen.current).map(t=>t.id);
      setNewIds(new Set(fresh));
      const to = setTimeout(()=>setNewIds(new Set()), 2000);
      prevLen.current = filtered.length;
      return ()=>clearTimeout(to);
    }
    prevLen.current = filtered.length;
  },[filtered.length]);

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"12px 14px 8px",borderBottom:`1px solid ${COLORS.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <span className="pulse-dot" style={{width:7,height:7,borderRadius:"50%",background:COLORS.red,display:"inline-block",boxShadow:`0 0 8px ${COLORS.red}`}} />
          <span style={{fontFamily:"'Courier Prime', monospace",fontSize:11,color:COLORS.textMid,letterSpacing:"0.12em"}}>LIVE FEED</span>
        </div>
        <div style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:COLORS.textLo,marginTop:3}}>
          {filtered.length} flagged shown
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",minHeight:0}}>
        {filtered.slice(0,60).map(tx=>(
          <TickerRow key={tx.id} tx={tx} fresh={newIds.has(tx.id)} selected={selected?.id===tx.id} onClick={()=>onSelect(tx)} />
        ))}
        {filtered.length===0 && (
          <div style={{padding:20,textAlign:"center",color:COLORS.textLo,fontFamily:"'Courier Prime', monospace",fontSize:11}}>
            No flagged activity<br/>matching filters
          </div>
        )}
      </div>
    </div>
  );
}

function TickerRow({ tx, fresh, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding:"9px 14px",
      borderBottom:`1px solid ${COLORS.bg}`,
      background: selected ? "#0e1a2e" : fresh ? "#09112299" : "transparent",
      cursor:"pointer",
      borderLeft: selected ? `2px solid ${COLORS.gold}` : "2px solid transparent",
      transition:"background 0.25s,border 0.2s",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
        <span style={{fontFamily:"'Cormorant Garamond', serif",fontSize:13,color:COLORS.text,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0}}>
          {tx.actor}
        </span>
        <span style={{fontFamily:"'Courier Prime', monospace",fontSize:12,color:tx.structuring?COLORS.red:COLORS.gold,fontWeight:700,flexShrink:0}}>
          {fmtUSD(tx.amount)}
        </span>
      </div>
      <div style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:COLORS.textMid,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {tx.event.title}
      </div>
      <div style={{display:"flex",gap:3,marginTop:5,flexWrap:"nowrap",overflow:"hidden",alignItems:"center"}}>
        {tx.flags.slice(0,3).map(f=><FlagBadge key={f.code} flag={f} small />)}
        <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo,marginLeft:"auto",flexShrink:0}}>{since(tx.ts)}</span>
      </div>
    </div>
  );
}

// ─── Center Deep Dive ─────────────────────────────────────────────────────────
function DeepDive({ transactions, filters, selected }) {
  const eventGroups = {};
  const filtered = applyFilters(transactions, filters);
  filtered.forEach(tx=>{
    const eid = tx.event.id;
    if(!eventGroups[eid]) eventGroups[eid]={event:tx.event,txs:[],vol:0,flags:0};
    eventGroups[eid].txs.push(tx);
    eventGroups[eid].vol += tx.amount;
    if(tx.flags.length) eventGroups[eid].flags++;
  });

  const sorted = Object.values(eventGroups).sort((a,b)=>b.flags-a.flags);
  const [tab, setTab] = useState(null);
  const focus = tab ? eventGroups[tab] : (sorted[0] || null);

  const flagBreak = {};
  if(focus) focus.txs.forEach(tx=>tx.flags.forEach(f=>{flagBreak[f.code]=(flagBreak[f.code]||0)+1;}));

  const maxFlag = Math.max(...Object.values(flagBreak), 1);

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"12px 18px 10px",borderBottom:`1px solid ${COLORS.border}`,flexShrink:0}}>
        <div style={{fontFamily:"'Courier Prime', monospace",fontSize:11,color:COLORS.textMid,letterSpacing:"0.12em",marginBottom:8}}>DEEP DIVE · EVENT ANALYSIS</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {sorted.slice(0,6).map(g=>(
            <button key={g.event.id} onClick={()=>setTab(g.event.id===tab?null:g.event.id)} style={{
              padding:"3px 9px",borderRadius:12,border:"1px solid",cursor:"pointer",
              borderColor:focus?.event.id===g.event.id ? COLORS.gold : COLORS.border,
              background:focus?.event.id===g.event.id ? COLORS.gold+"22" : "transparent",
              color:focus?.event.id===g.event.id ? COLORS.gold : COLORS.textMid,
              fontFamily:"'Courier Prime', monospace",fontSize:9,letterSpacing:"0.05em",
              transition:"all 0.2s",
            }}>{g.event.market}</button>
          ))}
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",minHeight:0,padding:"14px 18px"}}>
        {focus ? <>
          <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:18,color:COLORS.text,fontWeight:600,lineHeight:1.3,marginBottom:14}}>
            {focus.event.title}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}}>
            {[
              {label:"Volume",   val:fmtUSD(focus.vol),          color:COLORS.gold},
              {label:"Flagged",  val:focus.flags,                color:COLORS.red},
              {label:"Critical", val:focus.txs.filter(t=>t.riskScore>=80).length, color:"#9b59b6"},
            ].map(s=>(
              <div key={s.label} style={{background:COLORS.bg,border:`1px solid ${COLORS.border}`,borderRadius:6,padding:"8px 10px"}}>
                <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:3}}>{s.label}</div>
                <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:20,color:s.color,fontWeight:700}}>{s.val}</div>
              </div>
            ))}
          </div>

          {Object.keys(flagBreak).length>0 && (
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:8,letterSpacing:"0.1em"}}>FLAG DISTRIBUTION</div>
              {Object.entries(flagBreak).map(([code,count])=>{
                const ft = FLAG_TYPES.find(f=>f.code===code);
                if(!ft) return null;
                return (
                  <div key={code} style={{marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:ft.color}}>{ft.code} · {ft.label}</span>
                      <span style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:ft.color}}>{count}</span>
                    </div>
                    <div style={{height:3,background:COLORS.bg,borderRadius:2,overflow:"hidden"}}>
                      <div style={{width:`${(count/maxFlag)*100}%`,height:"100%",background:ft.color,borderRadius:2,transition:"width 0.8s ease"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:8,letterSpacing:"0.1em"}}>HIGH-RISK TRANSACTIONS</div>
            {focus.txs.filter(t=>t.riskScore>=55).sort((a,b)=>b.riskScore-a.riskScore).slice(0,8).map(tx=>(
              <div key={tx.id} style={{
                background:COLORS.bg,border:`1px solid ${COLORS.border}`,
                borderRadius:6,padding:"9px 12px",marginBottom:7,
                borderLeft:`3px solid ${riskColor(tx.riskScore)}`
              }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6}}>
                  <span style={{fontFamily:"'Cormorant Garamond', serif",fontSize:14,color:COLORS.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.actor}</span>
                  <span style={{fontFamily:"'Courier Prime', monospace",fontSize:12,color:COLORS.gold,fontWeight:700,flexShrink:0}}>{fmtUSD(tx.amount)}</span>
                </div>
                <div style={{display:"flex",gap:3,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                  {tx.flags.map(f=><FlagBadge key={f.code} flag={f} small />)}
                  <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo,marginLeft:"auto"}}>{tx.action} · {fmtTimeShort(tx.ts)}</span>
                </div>
                {tx.cluster && <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:"#9b59b6",marginTop:4}}>⬡ {tx.cluster}{tx.related?` · linked: ${tx.related}`:""}</div>}
                {tx.structuring && <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.red,marginTop:2}}>⚠ STRUCTURING DETECTED — sub-$10k avoidance</div>}
              </div>
            ))}
          </div>
        </> : <div style={{fontFamily:"'Courier Prime', monospace",fontSize:12,color:COLORS.textLo,padding:30,textAlign:"center"}}>No data matching current filters</div>}
      </div>
    </div>
  );
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
function RegPanel({ transactions, filters }) {
  const filtered = applyFilters(transactions, filters);
  const counts = {};
  FLAG_TYPES.forEach(f=>{counts[f.code]=0;});
  filtered.forEach(tx=>tx.flags.forEach(f=>{counts[f.code]=(counts[f.code]||0)+1;}));

  const totalVol  = filtered.filter(t=>t.flags.length).reduce((s,t)=>s+t.amount,0);
  const sarCount  = filtered.filter(t=>t.flags.length && t.amount>=5000).length;
  const ctrCount  = filtered.filter(t=>t.amount>10000).length;
  const strCount  = filtered.filter(t=>t.structuring).length;
  const clusters  = new Set(filtered.map(t=>t.cluster).filter(Boolean));
  const polyCount = filtered.filter(t=>t.source==="polymarket").length;

  return (
    <div style={{height:"100%",overflowY:"auto"}}>
      <div style={{padding:"12px 14px 8px",borderBottom:`1px solid ${COLORS.border}`}}>
        <div style={{fontFamily:"'Courier Prime', monospace",fontSize:11,color:COLORS.textMid,letterSpacing:"0.12em"}}>REGULATORY CHECKLIST</div>
      </div>
      <div style={{padding:"12px 14px"}}>

        {/* Live sources */}
        <div style={{marginBottom:14}}>
          <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:8,letterSpacing:"0.08em"}}>DATA SOURCES</div>
          {MARKETS_LIST.map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:m.active?m.color:"#1e2e48",display:"inline-block",boxShadow:m.active?`0 0 6px ${m.color}`:""}} />
                <span style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:m.active?COLORS.text:COLORS.textLo}}>{m.name}</span>
              </div>
              <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:m.active?m.color:COLORS.textLo}}>{m.active?"LIVE":"SOON"}</span>
            </div>
          ))}
          {polyCount > 0 && <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:"#00d4aa",marginTop:4}}>↑ {polyCount} live Polymarket records</div>}
        </div>

        {/* Summary */}
        <div style={{marginBottom:14}}>
          <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:8,letterSpacing:"0.08em"}}>THRESHOLD HITS</div>
          {[
            {label:"SAR-Eligible",    val:sarCount,       color:"#9b59b6", sub:"≥$5,000"},
            {label:"CTR Hits",        val:ctrCount,       color:COLORS.red, sub:">$10,000"},
            {label:"Structuring",     val:strCount,       color:COLORS.red, sub:"<$10k avoid"},
            {label:"Nested Clusters", val:clusters.size,  color:"#ff8c00",  sub:"30-day"},
          ].map(m=>(
            <div key={m.label} style={{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:COLORS.bg,border:`1px solid ${m.val>0?m.color+"44":COLORS.border}`,
              borderRadius:5,padding:"7px 10px",marginBottom:6,
            }}>
              <div>
                <div style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:m.val>0?m.color:COLORS.textMid}}>{m.label}</div>
                <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo}}>{m.sub}</div>
              </div>
              <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:20,color:m.val>0?m.color:COLORS.textLo,fontWeight:700}}>{m.val}</div>
            </div>
          ))}
        </div>

        {/* FinCEN matrix */}
        <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:8,letterSpacing:"0.08em"}}>FINCEN MATRIX</div>
        {FLAG_TYPES.map(f=>(
          <div key={f.code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${COLORS.bg}`}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:counts[f.code]>0?f.color:COLORS.textLo,display:"inline-block"}} />
                <span style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:counts[f.code]>0?COLORS.text:COLORS.textMid}}>{f.label}</span>
              </div>
              <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo,marginLeft:10}}>{f.severity}</div>
            </div>
            <span style={{fontFamily:"'Courier Prime', monospace",fontSize:13,fontWeight:700,color:counts[f.code]>0?f.color:COLORS.textLo}}>{counts[f.code]}</span>
          </div>
        ))}

        <div style={{marginTop:14,background:COLORS.bg,border:`1px solid ${COLORS.gold}33`,borderRadius:5,padding:"10px 12px"}}>
          <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid}}>TOTAL FLAGGED VOLUME</div>
          <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:22,color:COLORS.gold,fontWeight:700,marginTop:4}}>{fmtUSD(totalVol)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Engine ────────────────────────────────────────────────────────────
function applyFilters(txs, filters) {
  let out = [...txs];
  if (filters.minAmount) out = out.filter(t=>t.amount >= filters.minAmount);
  if (filters.maxAmount) out = out.filter(t=>t.amount <= filters.maxAmount);
  if (filters.includeFlags.length>0) out = out.filter(t=>t.flags.some(f=>filters.includeFlags.includes(f.code)));
  if (filters.excludeFlags.length>0) out = out.filter(t=>!t.flags.some(f=>filters.excludeFlags.includes(f.code)));
  if (filters.minRisk) out = out.filter(t=>t.riskScore >= filters.minRisk);
  if (filters.action !== "ALL") out = out.filter(t=>t.action === filters.action);
  if (filters.market !== "ALL") out = out.filter(t=>t.event.market === filters.market);
  if (filters.flaggedOnly) out = out.filter(t=>t.flags.length>0);
  if (filters.window === "1h") out = out.filter(t=>Date.now()-t.ts < 3600000);
  if (filters.window === "6h") out = out.filter(t=>Date.now()-t.ts < 21600000);
  if (filters.window === "24h") out = out.filter(t=>Date.now()-t.ts < 86400000);
  if (filters.sortBy === "risk") out.sort((a,b)=>b.riskScore-a.riskScore);
  if (filters.sortBy === "amount") out.sort((a,b)=>b.amount-a.amount);
  if (filters.sortBy === "time") out.sort((a,b)=>b.ts-a.ts);
  if (filters.sortBy === "flags") out.sort((a,b)=>b.flags.length-a.flags.length);
  return out;
}

const DEFAULT_FILTERS = {
  minAmount: 0,
  maxAmount: 0,
  includeFlags: [],
  excludeFlags: [],
  minRisk: 0,
  action: "ALL",
  market: "ALL",
  flaggedOnly: false,
  window: "24h",
  sortBy: "time",
};

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, setFilters, transactions, isMobile }) {
  const [open, setOpen] = useState(false);
  const filtered = applyFilters(transactions, filters);
  const activeCount = Object.entries(filters).filter(([k,v])=> {
    if(k==="window") return v!=="24h";
    if(k==="sortBy") return v!=="time";
    if(k==="action"||k==="market") return v!=="ALL";
    if(Array.isArray(v)) return v.length>0;
    if(typeof v==="boolean") return v;
    if(typeof v==="number") return v>0;
    return false;
  }).length;

  return (
    <div style={{background:COLORS.panel,borderTop:`1px solid ${COLORS.border}`,position:"relative",flexShrink:0}}>
      {/* Quick bar */}
      <div style={{
        display:"flex",alignItems:"center",gap:6,padding:"7px 14px",overflowX:"auto",
        scrollbarWidth:"none",
      }}>
        {/* Window quick-picks */}
        {["1h","6h","24h","all"].map(w=>(
          <button key={w} onClick={()=>setFilters(f=>({...f,window:w}))} style={{
            padding:"4px 10px",borderRadius:12,border:"1px solid",flexShrink:0,cursor:"pointer",
            borderColor: filters.window===w ? COLORS.cyan : COLORS.border,
            background: filters.window===w ? COLORS.cyan+"22" : "transparent",
            color: filters.window===w ? COLORS.cyan : COLORS.textMid,
            fontFamily:"'Courier Prime', monospace",fontSize:10,
          }}>{w.toUpperCase()}</button>
        ))}
        <div style={{width:1,height:20,background:COLORS.border,flexShrink:0}} />

        {/* Sort quick-picks */}
        {[{v:"time",l:"Latest"},{v:"risk",l:"Risk↓"},{v:"amount",l:"Amount↓"},{v:"flags",l:"Flags↓"}].map(s=>(
          <button key={s.v} onClick={()=>setFilters(f=>({...f,sortBy:s.v}))} style={{
            padding:"4px 10px",borderRadius:12,border:"1px solid",flexShrink:0,cursor:"pointer",
            borderColor: filters.sortBy===s.v ? COLORS.gold : COLORS.border,
            background: filters.sortBy===s.v ? COLORS.gold+"22" : "transparent",
            color: filters.sortBy===s.v ? COLORS.gold : COLORS.textMid,
            fontFamily:"'Courier Prime', monospace",fontSize:10,
          }}>{s.l}</button>
        ))}
        <div style={{width:1,height:20,background:COLORS.border,flexShrink:0}} />

        {/* Flagged only */}
        <button onClick={()=>setFilters(f=>({...f,flaggedOnly:!f.flaggedOnly}))} style={{
          padding:"4px 10px",borderRadius:12,border:"1px solid",flexShrink:0,cursor:"pointer",
          borderColor: filters.flaggedOnly ? COLORS.red : COLORS.border,
          background: filters.flaggedOnly ? COLORS.red+"22" : "transparent",
          color: filters.flaggedOnly ? COLORS.red : COLORS.textMid,
          fontFamily:"'Courier Prime', monospace",fontSize:10,
        }}>🚩 Flagged Only</button>

        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontFamily:"'Courier Prime', monospace",fontSize:10,color:COLORS.textLo}}>{filtered.length} results</span>
          <button onClick={()=>setOpen(o=>!o)} style={{
            padding:"4px 12px",borderRadius:5,border:`1px solid ${activeCount>0?COLORS.gold:COLORS.border}`,
            background: activeCount>0 ? COLORS.gold+"22" : "transparent",
            color: activeCount>0 ? COLORS.gold : COLORS.textMid,
            fontFamily:"'Courier Prime', monospace",fontSize:10,cursor:"pointer",
            display:"flex",alignItems:"center",gap:5,
          }}>
            ⚙ Filters {activeCount>0 && <span style={{background:COLORS.red,color:"#fff",borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9}}>{activeCount}</span>}
          </button>
          {activeCount>0 && <button onClick={()=>setFilters(DEFAULT_FILTERS)} style={{padding:"4px 8px",borderRadius:5,border:`1px solid ${COLORS.border}`,background:"transparent",color:COLORS.textMid,fontFamily:"'Courier Prime', monospace",fontSize:9,cursor:"pointer"}}>Reset</button>}
        </div>
      </div>

      {/* Expanded filter panel */}
      {open && <FilterPanel filters={filters} setFilters={setFilters} onClose={()=>setOpen(false)} />}
    </div>
  );
}

function FilterPanel({ filters, setFilters, onClose }) {
  const set = (key, val) => setFilters(f=>({...f,[key]:val}));

  return (
    <div style={{
      position:"absolute",bottom:"100%",right:0,width:"min(520px, 100vw)",
      background:"#07101f",border:`1px solid ${COLORS.borderHi}`,
      borderRadius:"8px 8px 0 0",zIndex:200,
      boxShadow:"0 -10px 40px rgba(0,0,0,0.8)",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${COLORS.border}`}}>
        <span style={{fontFamily:"'Courier Prime', monospace",fontSize:11,color:COLORS.textMid,letterSpacing:"0.1em"}}>⚙ ADVANCED FILTERS</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:COLORS.textMid,fontSize:16,cursor:"pointer",lineHeight:1}}>×</button>
      </div>
      <div style={{padding:"14px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,maxHeight:"60vh",overflowY:"auto"}}>

        {/* Amount range */}
        <div style={{gridColumn:"1/-1"}}>
          <Label>AMOUNT RANGE</Label>
          <div style={{display:"flex",gap:10,marginTop:6}}>
            <NumberInput label="Min $" value={filters.minAmount} onChange={v=>set("minAmount",v)} />
            <NumberInput label="Max $" value={filters.maxAmount} onChange={v=>set("maxAmount",v)} />
          </div>
          {/* Visual slider */}
          <div style={{marginTop:8}}>
            <input type="range" min={0} max={25000} step={500} value={filters.minAmount||0}
              onChange={e=>set("minAmount",+e.target.value)}
              style={{width:"100%",accentColor:COLORS.gold}} />
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo}}>$0</span>
              <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.gold}}>{fmtUSD(filters.minAmount)} min</span>
              <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo}}>$25k</span>
            </div>
          </div>
        </div>

        {/* Min risk score */}
        <div style={{gridColumn:"1/-1"}}>
          <Label>MINIMUM RISK SCORE: <span style={{color:riskColor(filters.minRisk||0)}}>{filters.minRisk||0}</span></Label>
          <input type="range" min={0} max={100} step={5} value={filters.minRisk||0}
            onChange={e=>set("minRisk",+e.target.value)}
            style={{width:"100%",marginTop:6,accentColor:COLORS.red}} />
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo}}>All</span>
            <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textLo}}>Critical Only (80+)</span>
          </div>
        </div>

        {/* Include flags */}
        <div>
          <Label>INCLUDE FLAGS</Label>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
            {FLAG_TYPES.map(f=>(
              <ToggleChip key={f.code} label={f.code} color={f.color}
                active={filters.includeFlags.includes(f.code)}
                onClick={()=>set("includeFlags",
                  filters.includeFlags.includes(f.code)
                    ? filters.includeFlags.filter(c=>c!==f.code)
                    : [...filters.includeFlags,f.code])} />
            ))}
          </div>
        </div>

        {/* Exclude flags */}
        <div>
          <Label>EXCLUDE FLAGS</Label>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
            {FLAG_TYPES.map(f=>(
              <ToggleChip key={f.code} label={`${f.code} ✕`} color="#555"
                active={filters.excludeFlags.includes(f.code)}
                onClick={()=>set("excludeFlags",
                  filters.excludeFlags.includes(f.code)
                    ? filters.excludeFlags.filter(c=>c!==f.code)
                    : [...filters.excludeFlags,f.code])} />
            ))}
          </div>
        </div>

        {/* Action type */}
        <div>
          <Label>ACTION TYPE</Label>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
            {["ALL","BUY","SELL","CASHOUT","DEPOSIT"].map(a=>(
              <ToggleChip key={a} label={a} color={COLORS.cyan} active={filters.action===a} onClick={()=>set("action",a)} />
            ))}
          </div>
        </div>

        {/* Market source */}
        <div>
          <Label>MARKET</Label>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginTop:6}}>
            {["ALL","Polymarket","Kalshi","Manifold"].map(m=>(
              <ToggleChip key={m} label={m} color={COLORS.cyan} active={filters.market===m} onClick={()=>set("market",m)} />
            ))}
          </div>
          <div style={{marginTop:12}}>
            <Label>FLAGGED ONLY</Label>
            <ToggleChip label={filters.flaggedOnly?"YES — Flagged":"NO — Show All"} color={COLORS.red} active={filters.flaggedOnly} onClick={()=>set("flaggedOnly",!filters.flaggedOnly)} />
          </div>
        </div>

      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,letterSpacing:"0.08em"}}>{children}</div>;
}
function ToggleChip({ label, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"4px 10px",borderRadius:4,border:`1px solid ${active?color:COLORS.border}`,cursor:"pointer",
      background:active?color+"22":"transparent",color:active?color:COLORS.textMid,
      fontFamily:"'Courier Prime', monospace",fontSize:10,textAlign:"left",transition:"all 0.15s",
    }}>{label}</button>
  );
}
function NumberInput({ label, value, onChange }) {
  return (
    <div style={{flex:1}}>
      <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,marginBottom:4}}>{label}</div>
      <input type="number" value={value||""} onChange={e=>onChange(+e.target.value||0)}
        placeholder="0"
        style={{
          width:"100%",background:COLORS.bg,border:`1px solid ${COLORS.border}`,
          borderRadius:4,padding:"6px 8px",
          color:COLORS.text,fontFamily:"'Courier Prime', monospace",fontSize:11,
          outline:"none",
        }} />
    </div>
  );
}

// ─── Mobile Layout ────────────────────────────────────────────────────────────
function MobileLayout({ transactions, filters, setFilters, paused, setPaused }) {
  const [tab, setTab] = useState("feed");
  const [selected, setSelected] = useState(null);

  return (
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",background:COLORS.bg,overflow:"hidden"}}>
      {/* Mobile header */}
      <div style={{
        background:COLORS.panel,borderBottom:`1px solid ${COLORS.border}`,
        padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <BB_Logo size={32} />
          <div>
            <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:18,fontWeight:700,color:COLORS.text}}>BigBet</div>
            <div style={{fontFamily:"'Courier Prime', monospace",fontSize:8,color:COLORS.textMid,letterSpacing:"0.15em"}}>UNUSUAL ACTIVITY</div>
          </div>
        </div>
        <button onClick={()=>setPaused(p=>!p)} style={{
          padding:"5px 12px",borderRadius:4,border:`1px solid ${paused?COLORS.green:COLORS.red}`,
          background:paused?COLORS.green+"22":COLORS.red+"22",
          color:paused?COLORS.green:COLORS.red,
          fontFamily:"'Courier Prime', monospace",fontSize:10,cursor:"pointer",
        }}>{paused?"▶ GO":"⏸"}</button>
      </div>

      {/* Tab content */}
      <div style={{flex:1,overflow:"hidden",minHeight:0}}>
        {tab==="feed" && <Ticker transactions={transactions} filters={filters} onSelect={setSelected} selected={selected} />}
        {tab==="dive" && <DeepDive transactions={transactions} filters={filters} selected={selected} />}
        {tab==="reg"  && <RegPanel transactions={transactions} filters={filters} />}
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} setFilters={setFilters} transactions={transactions} isMobile />

      {/* Bottom tabs */}
      <div style={{
        background:COLORS.panel,borderTop:`1px solid ${COLORS.border}`,
        display:"flex",flexShrink:0,
      }}>
        {[{id:"feed",icon:"📡",label:"Feed"},{id:"dive",icon:"🔍",label:"Deep Dive"},{id:"reg",icon:"📋",label:"Regs"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,padding:"12px 0",border:"none",
            background:tab===t.id?COLORS.bg:"transparent",
            borderTop:tab===t.id?`2px solid ${COLORS.gold}`:"2px solid transparent",
            color:tab===t.id?COLORS.gold:COLORS.textMid,
            cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,
          }}>
            <span style={{fontSize:16}}>{t.icon}</span>
            <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Desktop Layout ───────────────────────────────────────────────────────────
function DesktopLayout({ transactions, filters, setFilters, paused, setPaused, polyLoading }) {
  const [selected, setSelected] = useState(null);
  const flagged = transactions.filter(t=>t.flags.length>0).length;
  const critical = transactions.filter(t=>t.riskScore>=80).length;

  return (
    <div style={{height:"100dvh",display:"flex",flexDirection:"column",background:COLORS.bg,overflow:"hidden"}}>
      {/* Header */}
      <header style={{
        background:COLORS.panel,borderBottom:`1px solid ${COLORS.border}`,
        padding:"10px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",
        flexShrink:0,zIndex:10,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <BB_Logo size={44} />
          <div>
            <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:24,fontWeight:700,color:COLORS.text,letterSpacing:"0.03em",lineHeight:1}}>BigBet</div>
            <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid,letterSpacing:"0.18em"}}>UNUSUAL ACTIVITY MONITOR</div>
          </div>
          {polyLoading && <span style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:"#00d4aa",marginLeft:10,animation:"blink 1s step-end infinite"}}>⬤ FETCHING POLYMARKET…</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:22}}>
          {[{l:"Flagged",v:flagged,c:COLORS.red},{l:"Critical",v:critical,c:"#9b59b6"},{l:"Total",v:transactions.length,c:COLORS.gold}].map(s=>(
            <div key={s.l} style={{textAlign:"center"}}>
              <div style={{fontFamily:"'Cormorant Garamond', serif",fontSize:22,color:s.c,fontWeight:700,lineHeight:1}}>{s.v}</div>
              <div style={{fontFamily:"'Courier Prime', monospace",fontSize:9,color:COLORS.textMid}}>{s.l}</div>
            </div>
          ))}
          <button onClick={()=>setPaused(p=>!p)} style={{
            padding:"6px 16px",borderRadius:4,border:`1px solid ${paused?COLORS.green:COLORS.red}`,
            background:paused?COLORS.green+"22":COLORS.red+"22",
            color:paused?COLORS.green:COLORS.red,
            fontFamily:"'Courier Prime', monospace",fontSize:10,cursor:"pointer",
          }}>{paused?"▶ RESUME":"⏸ PAUSE"}</button>
        </div>
      </header>

      {/* 3-col body */}
      <div style={{flex:1,display:"grid",gridTemplateColumns:"268px 1fr 232px",overflow:"hidden",minHeight:0}}>
        <div style={{borderRight:`1px solid ${COLORS.border}`,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <Ticker transactions={transactions} filters={filters} onSelect={setSelected} selected={selected} />
        </div>
        <div style={{overflow:"hidden",display:"flex",flexDirection:"column",background:"#050810"}}>
          <DeepDive transactions={transactions} filters={filters} selected={selected} />
        </div>
        <div style={{borderLeft:`1px solid ${COLORS.border}`,overflow:"hidden"}}>
          <RegPanel transactions={transactions} filters={filters} />
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar filters={filters} setFilters={setFilters} transactions={transactions} />
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function BigBetApp() {
  const [transactions, setTransactions] = useState(()=>genBatch(24));
  const [paused, setPaused] = useState(false);
  const [polyLoading, setPolyLoading] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isMobile, setIsMobile] = useState(()=>window.innerWidth < 768);

  // Responsive listener
  useEffect(()=>{
    const fn = ()=>setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);

  // Fetch real Polymarket data on mount
  useEffect(()=>{
    setPolyLoading(true);
    fetchPolymarketTrades().then(polys=>{
      if(polys.length>0) setTransactions(prev=>[...polys,...prev].slice(0,140));
      setPolyLoading(false);
    }).catch(()=>setPolyLoading(false));
  },[]);

  // Live tick
  useEffect(()=>{
    if(paused) return;
    const id = setInterval(()=>{
      const newTxs = genBatch(rnd(1,3));
      setTransactions(prev=>[...newTxs,...prev].slice(0,140));
    }, 2600);
    return ()=>clearInterval(id);
  },[paused]);

  // Re-fetch Polymarket every 90s
  useEffect(()=>{
    const id = setInterval(()=>{
      fetchPolymarketTrades().then(polys=>{
        if(polys.length>0) setTransactions(prev=>[...polys,...prev].slice(0,140));
      });
    }, 90000);
    return ()=>clearInterval(id);
  },[]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Courier+Prime:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#04060d;color:#d4e8ff;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#1e2e48;border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.2;}}
        .pulse-dot{animation:pulse 1.4s ease infinite;}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0.4;}}
        input[type=range]{-webkit-appearance:none;height:3px;border-radius:2px;background:#131d33;outline:none;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;cursor:pointer;}
        input[type=number]{-moz-appearance:textfield;}
        input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        button{border:none;outline:none;}
      `}</style>
      {isMobile
        ? <MobileLayout transactions={transactions} filters={filters} setFilters={setFilters} paused={paused} setPaused={setPaused} />
        : <DesktopLayout transactions={transactions} filters={filters} setFilters={setFilters} paused={paused} setPaused={setPaused} polyLoading={polyLoading} />
      }
    </>
  );
}
