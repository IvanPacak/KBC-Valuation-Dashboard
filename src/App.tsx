import { useState, useCallback, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Zap, RotateCcw } from 'lucide-react'

// ── Actual thesis data (from backtest table) ──────────────────────────────────
// No 2015 — backtest runs 2016–2025
const YEARS = [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025] as const
type Year = (typeof YEARS)[number]

// Actual KBC market prices from thesis table
const MARKET_PRICE: Record<number, number> = {
  2016:52.34, 2017:63.27, 2018:50.43, 2019:59.66, 2020:50.96,
  2021:68.84, 2022:59.46, 2023:58.11, 2024:74.54, 2025:111.25,
}

// Per-year per-method implied prices from thesis (4. Záverečné zhrnutie)
// At default method weights (40/25/20/15) these produce composite = thesis composite
// → MAPE 20.79% at defaults
interface BTRow { peer: number; sx7e: number; hist: number; just: number }
const BT: Record<number, BTRow> = {
  2016: { peer:44.19, sx7e:47.71, hist:52.10, just:47.19 },
  2017: { peer:45.16, sx7e:40.47, hist:56.11, just:27.03 },
  2018: { peer:43.39, sx7e:27.63, hist:55.64, just:58.18 },
  2019: { peer:36.62, sx7e:40.38, hist:57.84, just:65.31 },
  2020: { peer:29.09, sx7e:27.64, hist:50.25, just:17.38 },
  2021: { peer:43.04, sx7e:38.36, hist:64.21, just:73.71 },
  2022: { peer:35.91, sx7e:50.47, hist:63.31, just:79.76 },
  2023: { peer:43.15, sx7e:47.40, hist:72.92, just:40.04 },
  2024: { peer:55.66, sx7e:57.89, hist:76.20, just:82.74 },
  2025: { peer:83.98, sx7e:89.83, hist:83.24, just:71.80 },
}

// ── Per-year fundamentals & reference ratios (for ratio-weight sensitivity) ──
// These power the ratio-slider scaling: when rw ≠ default, each method's price
// scales by methodImpl(m, rw, y) / methodImpl(m, defaultRw, y).
// At defaultRw the scale = 1 everywhere → exact thesis MAPE 20.79%.

const EPS: Record<number, number> = {
  2016:7.08, 2017:10.27, 2018:7.87, 2019:7.45, 2020:3.91,
  2021:9.30, 2022:7.25, 2023:7.77, 2024:7.52, 2025:9.08,
}
const BV: Record<number, number> = {
  2016:58.02, 2017:83.41, 2018:64.89, 2019:61.27, 2020:40.51,
  2021:65.90, 2022:53.94, 2023:48.68, 2024:50.77, 2025:68.47,
}
const TBV: Record<number, number> = {
  2016:54.43, 2017:78.62, 2018:61.40, 2019:58.41, 2020:38.24,
  2021:62.34, 2022:51.35, 2023:46.02, 2024:47.75, 2025:61.78,
}

const PEER_PE: Record<number, number | null> = {
  2016:10.91, 2017:9.535, 2018:11.07, 2019:12.777,
  2020:null, 2021:9.073, 2022:9.389, 2023:9.063, 2024:9.757, 2025:10.4191,
}
const PEER_PB: Record<number, number | null> = {
  2016:0.6947, 2017:0.596, 2018:0.7357, 2019:0.8774,
  2020:null, 2021:0.7031, 2022:0.8192, 2023:0.9465, 2024:1.0863, 2025:1.1576,
}
const PEER_PTB: Record<number, number | null> = {
  2016:0.7319, 2017:0.6296, 2018:0.776, 2019:0.9241,
  2020:null, 2021:0.7429, 2022:0.8673, 2023:0.9977, 2024:1.1475, 2025:1.2224,
}
const SX7E_PE: Record<number, number> = {
  2016:11.2, 2017:9.5, 2018:11.8, 2019:13.5, 2020:9.2,
  2021:10.1, 2022:10.5, 2023:9.8, 2024:10.2, 2025:10.76,
}
const SX7E_PB: Record<number, number> = {
  2016:0.82, 2017:0.72, 2018:0.88, 2019:1.02, 2020:0.58,
  2021:0.78, 2022:0.88, 2023:0.95, 2024:1.12, 2025:1.24,
}
const SX7E_PTB: Record<number, number> = {
  2016:0.86, 2017:0.76, 2018:0.93, 2019:1.08, 2020:0.61,
  2021:0.82, 2022:0.93, 2023:1.01, 2024:1.18, 2025:1.32,
}
const HIST_PE = 7.44; const HIST_PB = 0.99; const HIST_PTB = 1.04
const JR_PE: Record<number, number> = {
  2016:10.896, 2017:11.343, 2018:12.5, 2019:14.151, 2020:11.039,
  2021:10.588, 2022:11.833, 2023:13.333, 2024:14.038, 2025:15.0,
}
const JR_PB: Record<number, number> = {
  2016:1.0, 2017:1.090, 2018:1.4, 2019:1.811, 2020:1.078,
  2021:1.441, 2022:1.883, 2023:2.296, 2024:2.462, 2025:2.708,
}
const JR_PTB: Record<number, number> = {
  2016:1.164, 2017:1.269, 2018:1.633, 2019:2.113, 2020:1.234,
  2021:1.647, 2022:2.167, 2023:2.648, 2024:2.846, 2025:3.125,
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface MethodW { peer: number; sector: number; historical: number; justified: number }
interface RatioW  { pe: number; pb: number; ptb: number }

const DEFAULT_METHOD: MethodW = { peer:40, sector:25, historical:20, justified:15 }
const DEFAULT_RATIO: RatioW   = { pe:40, pb:38, ptb:22 }

// ── Core calculation ──────────────────────────────────────────────────────────
// Returns the ratio-implied price for one method in one year (for scaling only)
function methodImpl(m: keyof BTRow, rw: RatioW, year: number): number {
  const rSum = rw.pe + rw.pb + rw.ptb
  if (!rSum) return 0
  const rPE = rw.pe/rSum, rPB = rw.pb/rSum, rPTB = rw.ptb/rSum
  const eps = EPS[year], bv = BV[year], tbv = TBV[year]
  if (m === 'peer') {
    const pe = PEER_PE[year], pb = PEER_PB[year], ptb = PEER_PTB[year]
    if (pe == null || pb == null || ptb == null) return 0
    return rPE*pe*eps + rPB*pb*bv + rPTB*ptb*tbv
  }
  if (m === 'sx7e') return rPE*SX7E_PE[year]*eps + rPB*SX7E_PB[year]*bv + rPTB*SX7E_PTB[year]*tbv
  if (m === 'hist') return rPE*HIST_PE*eps + rPB*HIST_PB*bv + rPTB*HIST_PTB*tbv
  // just
  return rPE*JR_PE[year]*eps + rPB*JR_PB[year]*bv + rPTB*JR_PTB[year]*tbv
}

// At DEFAULT_RATIO: scale = 1 → composite = thesis value → MAPE 20.79%
// At other rw: proportionally scales each method's thesis price
function impliedForYear(year: number, mw: MethodW, rw: RatioW): number {
  const d = BT[year]
  const ms: (keyof BTRow)[] = ['peer','sx7e','hist','just']
  const ws = [mw.peer, mw.sector, mw.historical, mw.justified]
  const mt = ws.reduce((s,v)=>s+v, 0)
  if (!mt) return 0
  return ms.reduce((sum, m, i) => {
    const def = methodImpl(m, DEFAULT_RATIO, year)
    const adj = methodImpl(m, rw, year)
    const scale = def > 0 ? adj / def : 1
    return sum + ws[i] * d[m] * scale
  }, 0) / mt
}

function computeMAPE(mw: MethodW, rw: RatioW): number {
  return YEARS.reduce((s,y) => s + Math.abs(impliedForYear(y,mw,rw) - MARKET_PRICE[y]) / MARKET_PRICE[y], 0)
    / YEARS.length * 100
}

function findOptimal() {
  const MKEYS = ['peer', 'sx7e', 'hist', 'just'] as const
  // Precompute BT values and default-ratio scaling denominators (constant)
  const btVals: number[][] = MKEYS.map(m => YEARS.map(y => BT[y][m]))
  const defImpl: number[][] = MKEYS.map(m => YEARS.map(y => methodImpl(m, DEFAULT_RATIO, y)))
  const mktVals: number[] = YEARS.map(y => MARKET_PRICE[y])

  function buildScales(rw: RatioW): number[][] {
    return MKEYS.map((m, mi) =>
      YEARS.map((y, yi) => {
        const d = defImpl[mi][yi]
        const a = methodImpl(m, rw, y)
        return d > 0 ? a / d : 1
      })
    )
  }

  function mapeOf(ws: number[], sc: number[][]): number {
    let err = 0
    for (let yi = 0; yi < YEARS.length; yi++) {
      let imp = 0
      for (let mi = 0; mi < 4; mi++) imp += ws[mi] * btVals[mi][yi] * sc[mi][yi]
      imp /= 100
      err += Math.abs(imp - mktVals[yi]) / mktVals[yi]
    }
    return err / YEARS.length * 100
  }

  let bestMape = Infinity
  let bestMw: MethodW = DEFAULT_METHOD
  let bestRw: RatioW = DEFAULT_RATIO

  function search(
    step: number,
    pr: [number,number], sr: [number,number], hr: [number,number],
    per: [number,number], pbr: [number,number]
  ) {
    for (let pe = per[0]; pe <= per[1]; pe += step) {
      for (let pb = pbr[0]; pb <= Math.min(pbr[1], 100 - pe); pb += step) {
        const ptb = 100 - pe - pb
        if (ptb < 0) continue
        const sc = buildScales({ pe, pb, ptb })
        for (let peer = pr[0]; peer <= pr[1]; peer += step) {
          for (let sec = sr[0]; sec <= Math.min(sr[1], 100 - peer); sec += step) {
            for (let hist = hr[0]; hist <= Math.min(hr[1], 100 - peer - sec); hist += step) {
              const just = 100 - peer - sec - hist
              if (just < 0) continue
              const mape = mapeOf([peer, sec, hist, just], sc)
              if (mape < bestMape) {
                bestMape = mape
                bestMw = { peer, sector: sec, historical: hist, justified: just }
                bestRw = { pe, pb, ptb }
              }
            }
          }
        }
      }
    }
  }

  // Pass 1: coarse grid (step=5) — ~409k evaluations, global scan
  search(5, [0,100],[0,100],[0,100],[0,100],[0,100])

  // Pass 2: fine grid (step=1) within ±6 of coarse best
  const R = 6
  const bm = bestMw, br = bestRw
  search(1,
    [Math.max(0, bm.peer-R),      Math.min(100, bm.peer+R)],
    [Math.max(0, bm.sector-R),    Math.min(100, bm.sector+R)],
    [Math.max(0, bm.historical-R),Math.min(100, bm.historical+R)],
    [Math.max(0, br.pe-R),        Math.min(100, br.pe+R)],
    [Math.max(0, br.pb-R),        Math.min(100, br.pb+R)]
  )

  return { mape: bestMape, mw: bestMw, rw: bestRw }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:'white', border:'1px solid #00AEEF', borderRadius:12,
      padding:'10px 14px', boxShadow:'0 4px 16px rgba(0,94,184,.15)',
      fontSize:13, minWidth:148,
    }}>
      <p style={{ fontWeight:700, color:'#1a1a2e', marginBottom:6 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color:p.color, display:'flex', justifyContent:'space-between', gap:16 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight:600 }}>€{Number(p.value).toFixed(2)}</span>
        </p>
      ))}
    </div>
  )
}

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v:number)=>void }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:13, color:'#4a5568' }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:700, color:'#00AEEF', fontVariantNumeric:'tabular-nums' }}>{value}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width:'100%' }}
      />
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedYear, setSelectedYear] = useState<Year>(2025)
  const [mw, setMw] = useState<MethodW>(DEFAULT_METHOD)
  const [rw, setRw] = useState<RatioW>(DEFAULT_RATIO)
  const [optMape, setOptMape] = useState<number | null>(null)
  const [optimizing, setOptimizing] = useState(false)

  const market  = MARKET_PRICE[selectedYear]
  const implied = useMemo(() => impliedForYear(selectedYear, mw, rw), [selectedYear, mw, rw])
  const deviation = ((implied - market) / market) * 100
  const mape = useMemo(() => computeMAPE(mw, rw), [mw, rw])

  const chartData = useMemo(() =>
    YEARS.map(y => ({
      year: y,
      'Market Price':  MARKET_PRICE[y],
      'Implied Value': +impliedForYear(y, mw, rw).toFixed(2),
    })),
    [mw, rw]
  )

  const handleOptimize = useCallback(() => {
    setOptimizing(true)
    setTimeout(() => {
      const best = findOptimal()
      setMw(best.mw); setRw(best.rw); setOptMape(best.mape); setOptimizing(false)
    }, 10)
  }, [])

  const handleReset = useCallback(() => {
    setMw(DEFAULT_METHOD); setRw(DEFAULT_RATIO); setOptMape(null)
  }, [])

  const isUnder = deviation >  0.5
  const isOver  = deviation < -0.5
  const devColor = isUnder ? '#16a34a' : isOver ? '#dc2626' : '#9ca3af'

  const mwSum = mw.peer + mw.sector + mw.historical + mw.justified
  const rwSum = rw.pe + rw.pb + rw.ptb

  const renderDot = (color: string) => (props: any) => {
    const { cx, cy, payload } = props
    const sel = payload.year === selectedYear
    return (
      <circle key={`dot-${payload.year}`} cx={cx} cy={cy}
        r={sel ? 7 : 3} fill={color} stroke="white" strokeWidth={sel ? 2.5 : 0} />
    )
  }

  // shared card style
  const card: React.CSSProperties = {
    background:'white', borderRadius:16, border:'1px solid #e5e7eb',
    padding:24, boxShadow:'0 1px 6px rgba(0,0,0,.06)',
  }
  const sectionLabel: React.CSSProperties = {
    fontSize:11, fontWeight:700, letterSpacing:'0.15em',
    color:'#9ca3af', textTransform:'uppercase', marginBottom:0,
  }

  return (
    <div style={{ minHeight:'100vh', background:'#f7f8fa', fontFamily:"system-ui,'Segoe UI',Roboto,sans-serif" }}>

      {/* Header */}
      <header style={{ background:'white', borderBottom:'1px solid #e5e7eb', padding:'14px 32px' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', alignItems:'center', gap:12 }}>
          <img
            src="kbc_logo.png"
            alt="KBC" style={{ height:32 }}
          />
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.18em', color:'#9ca3af', textTransform:'uppercase' }}>
            Valuation Simulator
          </span>
        </div>
      </header>

      <main style={{ maxWidth:1200, margin:'0 auto', padding:'40px 32px', display:'flex', flexDirection:'column', gap:28 }}>

        {/* Year selector */}
        <div>
          <p style={sectionLabel}>Year</p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12 }}>
            {YEARS.map(y => (
              <button key={y} onClick={() => setSelectedYear(y)} style={{
                padding:'6px 18px', borderRadius:9999, fontSize:14, fontWeight:500,
                border: y === selectedYear ? '1px solid #00AEEF' : '1px solid #e5e7eb',
                background: y === selectedYear ? '#00AEEF' : 'white',
                color: y === selectedYear ? 'white' : '#1a1a2e',
                cursor:'pointer', transition:'all .18s',
              }}>
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* Metric cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:16 }}>
          <div style={card}>
            <p style={{...sectionLabel, marginBottom:8}}>Market Price</p>
            <p style={{ fontSize:40, fontWeight:700, color:'#1a1a2e', lineHeight:1 }}>€{market.toFixed(2)}</p>
            <p style={{ fontSize:13, color:'#9ca3af', marginTop:6 }}>{selectedYear}</p>
          </div>
          <div style={card}>
            <p style={{...sectionLabel, marginBottom:8}}>Implied Value</p>
            <p style={{ fontSize:40, fontWeight:700, color:'#00AEEF', lineHeight:1 }}>€{implied.toFixed(2)}</p>
            <p style={{ fontSize:13, color:'#9ca3af', marginTop:6 }}>Composite model</p>
          </div>
          <div style={card}>
            <p style={{...sectionLabel, marginBottom:8}}>Deviation</p>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {isUnder ? <TrendingUp size={28} color="#16a34a" /> :
               isOver  ? <TrendingDown size={28} color="#dc2626" /> :
               <Minus size={28} color="#9ca3af" />}
              <p style={{ fontSize:40, fontWeight:700, color:devColor, lineHeight:1 }}>
                {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%
              </p>
            </div>
            <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:devColor, textTransform:'uppercase', marginTop:6 }}>
              {isUnder ? 'UNDERVALUED' : isOver ? 'OVERVALUED' : 'FAIR VALUE'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div style={{ ...card, display:'flex', flexDirection:'column', gap:16 }}>
            <p style={sectionLabel}>Method Weights</p>
            <SliderRow label="A. Peer Group"           value={mw.peer}       onChange={v => setMw(w=>({...w,peer:v}))} />
            <SliderRow label="B. Sector Benchmark"     value={mw.sector}     onChange={v => setMw(w=>({...w,sector:v}))} />
            <SliderRow label="C. Historical Multiples" value={mw.historical} onChange={v => setMw(w=>({...w,historical:v}))} />
            <SliderRow label="D. Justified Ratios"     value={mw.justified}  onChange={v => setMw(w=>({...w,justified:v}))} />
            <p style={{ fontSize:12, color:'#9ca3af' }}>Sum: {mwSum}%</p>
          </div>
          <div style={{ ...card, display:'flex', flexDirection:'column', gap:16 }}>
            <p style={sectionLabel}>Ratio Weights</p>
            <SliderRow label="P/E"  value={rw.pe}  onChange={v => setRw(w=>({...w,pe:v}))} />
            <SliderRow label="P/B"  value={rw.pb}  onChange={v => setRw(w=>({...w,pb:v}))} />
            <SliderRow label="P/TB" value={rw.ptb} onChange={v => setRw(w=>({...w,ptb:v}))} />
            <p style={{ fontSize:12, color:'#9ca3af' }}>Sum: {rwSum}%</p>
          </div>
        </div>

        {/* Optimize / Reset */}
        <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'center', gap:12 }}>
          <button onClick={handleOptimize} disabled={optimizing} style={{
            display:'flex', alignItems:'center', gap:8,
            background: optimizing ? '#9ca3af' : '#00AEEF',
            color:'white', fontWeight:700, fontSize:13, letterSpacing:'0.04em',
            padding:'13px 28px', borderRadius:12, border:'none',
            cursor: optimizing ? 'not-allowed' : 'pointer', transition:'background .18s',
          }}>
            <Zap size={16} />
            {optimizing ? 'Optimizing…' : 'FIND OPTIMAL WEIGHTS (LOWEST MAPE)'}
          </button>
          <button onClick={handleReset} style={{
            display:'flex', alignItems:'center', gap:8,
            background:'white', color:'#00AEEF', fontWeight:700, fontSize:13, letterSpacing:'0.04em',
            padding:'13px 22px', borderRadius:12,
            border:'1.5px solid #00AEEF', cursor:'pointer', transition:'all .18s',
          }}>
            <RotateCcw size={15} />
            RESET
          </button>
          {optMape !== null && (
            <span style={{ fontSize:14, fontWeight:600, color:'#00AEEF' }}>
              Optimal MAPE: {optMape.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Chart */}
        <div style={card}>
          <p style={{...sectionLabel, marginBottom:20}}>Backtest 2016–2025</p>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top:10, right:24, left:8, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f5" />
              <XAxis dataKey="year" tick={{ fill:'#9ca3af', fontSize:12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:'#9ca3af', fontSize:12 }} axisLine={false} tickLine={false}
                tickFormatter={v=>`€${v}`} width={58} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="plainline" wrapperStyle={{ paddingTop:16, fontSize:12, color:'#4a5568' }} />
              <ReferenceLine x={selectedYear} stroke="#00AEEF" strokeDasharray="5 4"
                strokeOpacity={0.45} strokeWidth={1.5} />
              <Line type="monotone" dataKey="Market Price"  stroke="#1a1a2e" strokeWidth={2.5}
                dot={renderDot('#1a1a2e')} activeDot={{ r:6, fill:'#1a1a2e', stroke:'white', strokeWidth:2 }}
                isAnimationActive={false} />
              <Line type="monotone" dataKey="Implied Value" stroke="#00AEEF" strokeWidth={2.5}
                dot={renderDot('#00AEEF')} activeDot={{ r:6, fill:'#00AEEF', stroke:'white', strokeWidth:2 }}
                isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p style={{ textAlign:'center', marginTop:12, fontSize:14, fontWeight:600, color:'#00AEEF' }}>
            MAPE across 2016–2025: {mape.toFixed(2)}%
          </p>
        </div>

      </main>
    </div>
  )
}
