"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthContext";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Q = { price: number | null; changePercent: number | null; change: number | null };
type NewsItem = { title: string; source: string; publishedAt: string; url: string };
type CongressTrade = { trader: string; ticker: string; type: string; range: string; date: string; party: string };
type WatchItem = { ticker: string; price?: number | null; changePercent?: number | null };
type EconEvent = { id: string; name: string; date: string; impact: "HIGH"|"MEDIUM"|"LOW"; country: string };
type ChartPt = { date: string; close: number };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(name?: string | null) {
  const h = new Date().getHours();
  const w = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${w}, ${name}` : w;
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtPrice(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 10000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useCountUp(target: number | null, duration = 1100) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(undefined);
  useEffect(() => {
    if (target == null) return;
    setValue(0);
    const start = Date.now();
    const run = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(run);
    };
    rafRef.current = requestAnimationFrame(run);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return value;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

const I = {
  link:          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"/></svg>,
  trendingUp:    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  building:      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 22V12h6v10M9 7h1m4 0h1M9 11h1m4 0h1"/></svg>,
  bell:          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  target:        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  activity:      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  barChart:      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  arrowUp:       <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  newspaper:     <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>,
  star:          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  calendar:      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  chat:          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  zap:           <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  globe:         <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  institution:   <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>,
  predict:       <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  users:         <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  mail:          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  radio:         <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 16 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
  bookOpen:      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  trendingDown:  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
  database:      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  shield:        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  cpu:           <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>,
  dollarSign:    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  mapPin:        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 13 8 13s8-7.75 8-13a8 8 0 0 0-8-8z"/></svg>,
};

// ── BentoCard ─────────────────────────────────────────────────────────────────

function BentoCard({ href, title, icon, children, loading=false, delay=0, className="" }: {
  href: string; title: string; icon: React.ReactNode;
  children: React.ReactNode; loading?: boolean; delay?: number; className?: string;
}) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
      whileHover={{ scale: 1.012, boxShadow: "0 0 24px rgba(0,200,150,0.1)", transition: { duration: 0.15 } }}
      onClick={() => router.push(href)}
      className={`cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#050713] ${className}`}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center text-zinc-600">{icon}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{title}</span>
        </div>
        <Link href={href} onClick={e => e.stopPropagation()} className="text-xs text-zinc-700 hover:text-[var(--accent-color)]">→</Link>
      </div>
      <div className="px-4 pb-4">
        {loading ? (
          <div className="space-y-2 pt-2">
            {[1,2,3].map(i => <div key={i} className="h-3.5 animate-pulse rounded bg-white/5" style={{ width:`${90-i*10}%` }}/>)}
          </div>
        ) : children}
      </div>
    </motion.div>
  );
}

function Skel({ n=3 }:{n?:number}) {
  return <div className="space-y-2 pt-1">{Array.from({length:n}).map((_,i)=><div key={i} className="h-3 animate-pulse rounded bg-white/5" style={{width:`${88-i*10}%`}}/>)}</div>;
}

// ── Ambient / overlay components ──────────────────────────────────────────────

function AmbientParticles() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden style={{ zIndex: 0 }}>
      {[8,23,41,59,77,91].map((left, i) => (
        <div key={i}
          className="absolute h-1 w-1 rounded-full bg-[var(--accent-color)]"
          style={{
            left: `${left}%`, bottom: "-4px", opacity: 0,
            animation: `ambient-float ${18 + i * 4}s ease-in infinite`,
            animationDelay: `${i * 3.1}s`,
          }}
        />
      ))}
    </div>
  );
}

function ParallaxGrid() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = (e: MouseEvent) => {
      const dx = (e.clientX / window.innerWidth - 0.5) * 10;
      const dy = (e.clientY / window.innerHeight - 0.5) * 10;
      el.style.backgroundPosition = `${dx}px ${dy}px`;
    };
    window.addEventListener("mousemove", handle, { passive: true });
    return () => window.removeEventListener("mousemove", handle);
  }, []);
  return (
    <div ref={ref}
      className="pointer-events-none fixed inset-0"
      aria-hidden
      style={{
        zIndex: 0,
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "36px 36px",
        transition: "background-position 0.15s ease-out",
      }}
    />
  );
}

function MarketOpenFlash() {
  const [flash, setFlash] = useState<{ label: string; isOpen: boolean } | null>(null);
  useEffect(() => {
    const check = () => {
      const etStr = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
      const et = new Date(etStr);
      const h = et.getHours(), m = et.getMinutes(), s = et.getSeconds();
      const isWeekday = et.getDay() >= 1 && et.getDay() <= 5;
      if (!isWeekday) return;
      if (h === 9 && m === 30 && s < 15) {
        setFlash({ label: "Markets just opened", isOpen: true });
        setTimeout(() => setFlash(null), 9000);
      } else if (h === 16 && m === 0 && s < 15) {
        setFlash({ label: "Markets just closed", isOpen: false });
        setTimeout(() => setFlash(null), 9000);
      }
    };
    const id = setInterval(check, 5000);
    check();
    return () => clearInterval(id);
  }, []);
  if (!flash) return null;
  return (
    <div
      className={`mb-4 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
        flash.isOpen
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-400"
      }`}
      style={{ animation: "market-flash-in 0.5s ease-out" }}
    >
      <span className={`h-2 w-2 rounded-full sonar-dot ${flash.isOpen ? "bg-emerald-400 text-emerald-400" : "bg-amber-400 text-amber-400"}`} />
      {flash.label}
    </div>
  );
}

// ── Dashboard Header ──────────────────────────────────────────────────────────

function DashboardHeader() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(()=>setNow(new Date()), 30000); return ()=>clearInterval(id); }, []);
  return (
    <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} transition={{duration:0.3}}
      className="mb-5 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">{getGreeting(user?.name || user?.username)}</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          {now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · {now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
        </p>
      </div>
    </motion.div>
  );
}

// ── LEFT: Bond Yield Curve (30-day multi-line history) ────────────────────────

const YIELD_COLORS: Record<string,string> = { "2Y":"#60a5fa", "5Y":"#34d399", "10Y":"#f59e0b", "30Y":"#f87171" };

function BondYieldCurveCard({delay}:{delay:number}) {
  const [history,setHistory] = useState<{label:string;data:{date:string;value:number}[]}[]>([]);
  const [loading,setLoading] = useState(true);
  const [spread,setSpread] = useState<number|null>(null);
  const [inverted,setInverted] = useState(false);

  useEffect(()=>{
    fetch("/api/bonds/history").then(r=>r.json()).then(d=>{
      const h:any[]=d?.history??[];
      setHistory(h);
      const y2=h.find((s:any)=>s.label==="2Y")?.data?.at(-1)?.value;
      const y10=h.find((s:any)=>s.label==="10Y")?.data?.at(-1)?.value;
      if(y2!=null&&y10!=null){setSpread(+(y10-y2).toFixed(3));setInverted(y2>y10);}
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const chartData = useMemo(()=>{
    if(!history.length) return [];
    const dates=[...new Set(history.flatMap(s=>s.data.map(p=>p.date)))].sort();
    return dates.map(date=>{
      const pt:Record<string,any>={date};
      for(const s of history){const p=s.data.find(x=>x.date===date);if(p)pt[s.label]=p.value;}
      return pt;
    });
  },[history]);

  return (
    <BentoCard href="/bonds" title="Treasury Yields · 30 Days" icon={I.trendingUp} delay={delay} loading={loading} className="h-[380px]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${inverted?"bg-red-500/20 text-red-400":"bg-emerald-500/20 text-emerald-400"}`}>{inverted?"Inverted":"Normal"}</span>
        {spread!=null&&<span className="text-[10px] text-zinc-500">2s10s: <span className={spread<0?"text-red-400":"text-zinc-300"}>{spread>=0?"+":""}{spread.toFixed(2)}%</span></span>}
        <div className="ml-auto flex gap-2.5">
          {Object.entries(YIELD_COLORS).map(([lbl,col])=>(
            <span key={lbl} className="flex items-center gap-1 text-[9px]" style={{color:col}}>
              <span className="inline-block h-1 w-3 rounded" style={{backgroundColor:col}}/>
              {lbl}
            </span>
          ))}
        </div>
      </div>
      {chartData.length>0?(
        <ResponsiveContainer width="100%" height={285}>
          <LineChart data={chartData} margin={{top:4,right:4,bottom:0,left:-22}}>
            <XAxis dataKey="date" tick={{fill:"#52525b",fontSize:8,dy:6}} axisLine={false} tickLine={false} tickFormatter={v=>String(v).slice(5)} interval="preserveStartEnd"/>
            <YAxis tick={{fill:"#52525b",fontSize:9}} axisLine={false} tickLine={false} domain={["auto","auto"]}/>
            <Tooltip contentStyle={{backgroundColor:"#0F1520",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,fontSize:11}} labelStyle={{color:"#a1a1aa"}}
              formatter={(v:any,name:any)=>[`${Number(v).toFixed(2)}%`,name]} cursor={{stroke:"rgba(255,255,255,0.08)"}}/>
            {Object.entries(YIELD_COLORS).map(([lbl,col])=>(
              <Line key={lbl} type="monotone" dataKey={lbl} stroke={col} strokeWidth={1.5} dot={false} activeDot={{r:3}} connectNulls/>
            ))}
          </LineChart>
        </ResponsiveContainer>
      ):(
        <div className="flex h-[285px] items-center justify-center text-xs text-zinc-600">Yield history unavailable</div>
      )}
    </BentoCard>
  );
}

// ── LEFT: CEO Alerts ──────────────────────────────────────────────────────────

function CEOAlertsCard({delay}:{delay:number}) {
  const [alerts,setAlerts] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    const load=()=>fetch("/api/ceo-alerts").then(r=>r.json()).then(d=>{
      const items=Array.isArray(d)?d:d?.alerts??[];
      setAlerts(items.slice(0,5));
    }).catch(()=>{});
    load();setLoading(false);
    const id=setInterval(load,5*60*1000);return()=>clearInterval(id);
  },[]);
  return (
    <BentoCard href="/ceos" title="CEO Alerts" icon={I.building} delay={delay} loading={loading} className="min-h-[260px]">
      {alerts.length===0?<p className="pt-1 text-xs text-zinc-600">No recent CEO alerts</p>:(
        <ul className="space-y-2.5 pt-1">
          {alerts.map((a,i)=>(
            <li key={i} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
              <p className="line-clamp-2 text-xs font-medium leading-snug text-zinc-300">{a.title}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-600">
                {a.company&&<span>{a.company}</span>}
                {a.matchedTicker&&<span className="text-[var(--accent-color)]">{a.matchedTicker}</span>}
                <span className="ml-auto">{timeAgo(a.publishedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ── LEFT: Social Feed (recent posts) ─────────────────────────────────────────

function SocialFeedCard({delay}:{delay:number}) {
  const [posts,setPosts] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    fetch("/api/posts?limit=10").then(r=>r.json()).then(d=>{
      const items=Array.isArray(d)?d:d?.posts??[];
      setPosts(items.slice(0,10));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  return (
    <BentoCard href="/social-feed" title="Social Feed" icon={I.chat} delay={delay} loading={loading} className="min-h-[700px]">
      {posts.length===0?<p className="pt-1 text-xs text-zinc-600">No recent posts</p>:(
        <ul className="space-y-3 pt-1">
          {posts.map((p,i)=>(
            <li key={i} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
              <p className="line-clamp-3 text-xs text-zinc-300 leading-relaxed">{p.content}</p>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
                <span className="font-medium text-zinc-500">@{p.author?.handle??p.username??"trader"}</span>
                <span>·</span>
                <span>{timeAgo(p.timestamp??p.created_at??"")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ── LEFT: Messages ────────────────────────────────────────────────────────────

function MessagesCard({delay}:{delay:number}) {
  const { user } = useAuth();
  const [unread,setUnread] = useState(0);
  const [dms,setDms] = useState<any[]>([]);
  const [tickerPrices,setTickerPrices] = useState<Record<string,Q>>({});
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    if(!user){setLoading(false);return;}
    Promise.allSettled([
      fetch("/api/conversations/unread").then(r=>r.json()).then(d=>setUnread(d?.count??0)).catch(()=>{}),
      fetch("/api/conversations").then(r=>r.json()).then(async d=>{
        const list:any[]=Array.isArray(d)?d:d?.dms??d?.conversations??[];
        const top=list.slice(0,3);
        setDms(top);
        // Fetch live prices for any _ticker: previews
        const tickers=[...new Set(top.map((c:any)=>{
          const m=String(c.last_message_preview??"").trim().match(/_ticker:(\S+)/i);
          return m?m[1].replace(/[^A-Z0-9.\-^=]/gi,"").toUpperCase()||null:null;
        }).filter(Boolean))] as string[];
        if(tickers.length>0){
          const prices:Record<string,Q>={};
          await Promise.allSettled(tickers.map(async sym=>{
            const r=await fetch(`/api/ticker-quote?symbol=${encodeURIComponent(sym)}`);
            if(r.ok) prices[sym]=await r.json();
          }));
          setTickerPrices(prices);
        }
      }).catch(()=>{}),
    ]).finally(()=>setLoading(false));
  },[user]);

  const renderPreview=(preview:string)=>{
    const m=preview.trim().match(/_ticker:(\S+)/i);
    if(m){
      const sym=m[1].toUpperCase();
      const q=tickerPrices[sym];
      const up=(q?.changePercent??0)>=0;
      if(q?.price!=null) return (
        <span className="flex items-center gap-1 shrink-0">
          <span className="font-semibold text-zinc-300">{sym}</span>
          <span className="text-zinc-400">${q.price.toFixed(2)}</span>
          <span className={`text-[9px] font-bold ${up?"text-emerald-400":"text-red-400"}`}>{up?"+":""}{(q.changePercent??0).toFixed(1)}%</span>
        </span>
      );
      return <span className="text-zinc-500">[{sym}]</span>;
    }
    return <span className="truncate text-[10px] text-zinc-600">{preview.slice(0,26)}</span>;
  };

  return (
    <BentoCard href="/messages" title="Messages" icon={I.mail} delay={delay} loading={loading} className="min-h-[180px]">
      <div className="pt-1">
        {unread>0&&<div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--accent-color)]/10 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-color)]"/>
          <span className="text-xs font-semibold text-[var(--accent-color)]">{unread} unread message{unread!==1?"s":""}</span>
        </div>}
        {dms.length===0?<p className="text-xs text-zinc-600">{user?"No conversations yet":"Sign in to see messages"}</p>:(
          <ul className="space-y-2.5">
            {dms.map((d:any,i:number)=>(
              <li key={i} className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-700"/>
                  <span className="truncate">{d.other_user?.name??d.other_user?.username??"User"}</span>
                </div>
                {d.last_message_preview&&renderPreview(String(d.last_message_preview))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </BentoCard>
  );
}

// ── LEFT: Price Alerts ────────────────────────────────────────────────────────

function PriceAlertsCard({delay}:{delay:number}) {
  const [alerts,setAlerts] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    try{
      const stored=localStorage.getItem("quantivtrade-price-alerts");
      if(stored){const parsed=JSON.parse(stored);setAlerts((Array.isArray(parsed)?parsed:[]).filter((a:any)=>a?.status==="active").slice(0,4));}
    }catch{}
    setLoading(false);
  },[]);
  return (
    <BentoCard href="/watchlist" title="Price Alerts" icon={I.bell} delay={delay} loading={loading} className="min-h-[160px]">
      {alerts.length===0?<p className="pt-1 text-xs text-zinc-600">No active price alerts</p>:(
        <ul className="space-y-2 pt-1">
          {alerts.map((a,i)=>(
            <li key={i} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">{a.ticker}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600">{a.direction??"above"}</span>
                <span className="font-medium text-[var(--accent-color)]">${(+a.targetPrice).toFixed(2)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ── LEFT: Trade Journal ───────────────────────────────────────────────────────

function JournalCard({delay}:{delay:number}) {
  const { user } = useAuth();
  const [stats,setStats] = useState<{total:number;wins:number;totalPnl:number;bestPnl:number|null}|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    if(!user){setLoading(false);return;}
    fetch("/api/trades").then(r=>r.json()).then(d=>{
      const items:any[]=Array.isArray(d)?d:d?.trades??[];
      const getPnl=(e:any)=>{const v=e.pnlDollars??e.pnl_dollars??e.pnl??e.profit_loss;return v!=null?+(v):null;};
      const closed=items.filter(e=>getPnl(e)!=null);
      const wins=closed.filter(e=>(getPnl(e)??0)>=0).length;
      const totalPnl=closed.reduce((s,e)=>s+(getPnl(e)??0),0);
      const bestPnl=closed.length>0?Math.max(...closed.map(e=>getPnl(e)??-Infinity)):null;
      setStats({total:items.length,wins,totalPnl,bestPnl:bestPnl===-Infinity?null:bestPnl});
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[user]);
  const winRate=stats?Math.round((stats.wins/Math.max(stats.total,1))*100):0;
  const animTotal   = useCountUp(stats?.total ?? null);
  const animWinRate = useCountUp(stats?Math.round((stats.wins/Math.max(stats.total,1))*100):null);
  const animPnl     = useCountUp(stats?.totalPnl ?? null, 1300);
  const animBest    = useCountUp(stats?.bestPnl ?? null, 1300);
  return (
    <BentoCard href="/journal" title="Trade Analytics" icon={I.bookOpen} delay={delay} loading={loading} className="min-h-[200px]">
      {!user?<p className="pt-1 text-xs text-zinc-600">Sign in to see analytics</p>:
      stats==null||stats.total===0?<p className="pt-1 text-xs text-zinc-600">No trades recorded yet</p>:(
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">Total Trades</p>
            <p className="mt-0.5 text-xl font-bold text-zinc-200">{Math.round(animTotal)}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">Win Rate</p>
            <p className={`mt-0.5 text-xl font-bold ${winRate>=50?"text-emerald-400":"text-red-400"}`}>{Math.round(animWinRate)}%</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">Total P&amp;L</p>
            <p className={`mt-0.5 text-sm font-bold ${stats.totalPnl>=0?"text-emerald-400":"text-red-400"}`}>{animPnl>=0?"+":""}{animPnl.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">Best Trade</p>
            <p className={`mt-0.5 text-sm font-bold ${(stats.bestPnl??0)>=0?"text-emerald-400":"text-zinc-400"}`}>{stats.bestPnl!=null?`${animBest>=0?"+":""}${animBest.toFixed(2)}`:"—"}</p>
          </div>
        </div>
      )}
    </BentoCard>
  );
}

// ── CENTER: Top Movers ────────────────────────────────────────────────────────

const GAINERS_LIST = ["NVDA","TSLA","AMD","META","AMZN","PLTR","SOFI","MSTR"];
const LOSERS_LIST = ["INTC","BA","WBA","MPW","PARA","F","T","PINS"];

function TopMoversCard({delay}:{delay:number}) {
  const [tab,setTab] = useState<"gainers"|"losers">("gainers");
  const [quotes,setQuotes] = useState<Record<string,Q>>({});
  const [loading,setLoading] = useState(true);

  const fetchAll = useCallback(async()=>{
    const out:Record<string,Q>={};
    await Promise.allSettled([...GAINERS_LIST,...LOSERS_LIST].map(async sym=>{
      try{const r=await fetch(`/api/ticker-quote?symbol=${encodeURIComponent(sym)}`);if(r.ok)out[sym]=await r.json();}catch{}
    }));
    setQuotes(out);setLoading(false);
  },[]);

  useEffect(()=>{fetchAll();const id=setInterval(fetchAll,60000);return()=>clearInterval(id);},[fetchAll]);

  const list=(tab==="gainers"?GAINERS_LIST:LOSERS_LIST)
    .map(sym=>({sym,q:quotes[sym]})).filter(x=>x.q?.price!=null)
    .sort((a,b)=>tab==="gainers"?(b.q.changePercent??0)-(a.q.changePercent??0):(a.q.changePercent??0)-(b.q.changePercent??0))
    .slice(0,5);

  return (
    <BentoCard href="/screener" title="Top Movers" icon={I.arrowUp} delay={delay} loading={loading} className="min-h-[260px]">
      <div className="mb-3 flex gap-1">
        {(["gainers","losers"] as const).map(t=>(
          <button key={t} onClick={e=>{e.stopPropagation();setTab(t);}}
            className={`rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${tab===t?"bg-[var(--accent-color)]/20 text-[var(--accent-color)]":"text-zinc-600 hover:text-zinc-400"}`}>
            {t}
          </button>
        ))}
      </div>
      {list.length===0?<p className="pt-1 text-xs text-zinc-600">No mover data available</p>:(
        <ul className="space-y-1">
          {list.map(({sym,q})=>{const up=(q.changePercent??0)>=0;return(
            <li key={sym} onClick={e=>{e.stopPropagation();window.location.assign(`/search/${encodeURIComponent(sym)}`);}}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5 cursor-pointer">
              <span className="text-sm font-bold text-zinc-200">{sym}</span>
              <div className="text-right"><p className="text-xs text-zinc-400">{fmtPrice(q.price)}</p>
                <p className={`text-[10px] font-bold ${up?"text-emerald-400":"text-red-400"}`}>{fmtPct(q.changePercent)}</p>
              </div>
            </li>
          );})}
        </ul>
      )}
    </BentoCard>
  );
}

// ── CENTER: Live Chart (self-hosted recharts) ─────────────────────────────────

function LiveChartCard({delay}:{delay:number}) {
  const [symbol,setSymbol] = useState("SPY");
  const [input,setInput] = useState("SPY");
  const [data,setData] = useState<ChartPt[]>([]);
  const [loading,setLoading] = useState(true);
  const [quote,setQuote] = useState<Q|null>(null);

  const loadChart = useCallback(async(sym:string)=>{
    setLoading(true);
    try{
      const [chartRes,quoteRes] = await Promise.allSettled([
        fetch(`/api/ticker-chart?symbol=${encodeURIComponent(sym)}&range=1d`).then(r=>r.ok?r.json():null),
        fetch(`/api/ticker-quote?symbol=${encodeURIComponent(sym)}`).then(r=>r.ok?r.json():null),
      ]);
      if(chartRes.status==="fulfilled"&&chartRes.value){
        const raw=chartRes.value?.candles??chartRes.value?.data??chartRes.value;
        if(Array.isArray(raw)) setData(raw.map((p:any)=>({date:p.date??p.time??String(p.t),close:p.close??p.c??0})));
      }
      if(quoteRes.status==="fulfilled"&&quoteRes.value) setQuote(quoteRes.value);
    }catch{}
    setLoading(false);
  },[]);

  useEffect(()=>{loadChart(symbol);const id=setInterval(()=>loadChart(symbol),60000);return()=>clearInterval(id);},[symbol,loadChart]);

  const up=(quote?.changePercent??0)>=0;
  const prevPriceRef = useRef<number|null>(null);
  const [priceTick, setPriceTick] = useState(false);
  const [tickKey, setTickKey] = useState(0);
  useEffect(()=>{
    if(quote?.price!=null&&prevPriceRef.current!=null&&quote.price!==prevPriceRef.current){
      setTickKey(k=>k+1);
      setPriceTick(true);
      const t=setTimeout(()=>setPriceTick(false),800);
      return()=>clearTimeout(t);
    }
    prevPriceRef.current=quote?.price??null;
  },[quote?.price]);
  const minV = data.length>0?Math.min(...data.map(d=>d.close)):0;
  const maxV = data.length>0?Math.max(...data.map(d=>d.close)):100;
  const pad  = (maxV-minV)*0.1||1;

  return (
    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay,duration:0.35,ease:"easeOut"}}
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#050713] min-h-[420px] flex flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center text-zinc-600">{I.barChart}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Live Chart</span>
          {quote?.price!=null&&<>
            <span key={tickKey} className={`text-sm font-bold text-zinc-200${priceTick?" price-tick":""}`}>{fmtPrice(quote.price)}</span>
            <span className={`text-xs font-semibold ${up?"text-emerald-400":"text-red-400"}`}>{fmtPct(quote.changePercent)}</span>
          </>}
        </div>
        <form onSubmit={e=>{e.preventDefault();e.stopPropagation();setSymbol(input.toUpperCase().trim());loadChart(input.toUpperCase().trim());}} onClick={e=>e.stopPropagation()} className="flex items-center gap-2">
          <input type="text" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ticker..."
            className="h-6 w-20 rounded-lg border border-white/10 bg-white/5 px-2 text-[10px] text-zinc-300 outline-none focus:border-[var(--accent-color)]/50"/>
          <button type="submit" className="rounded-lg bg-[var(--accent-color)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--accent-color)] hover:bg-[var(--accent-color)]/30 transition">Go</button>
        </form>
      </div>
      <div className="flex-1 min-h-0 px-2 pb-3">
        {loading?(
          <div className="flex h-[340px] flex-col justify-around py-4 px-2" aria-label="Loading chart">
            {Array.from({length:6}).map((_,i)=>(
              <div key={i} className="h-px rounded bg-white/10"
                style={{animation:"grid-line-draw 0.55s ease-out forwards",animationDelay:`${i*0.09}s`,transform:"scaleX(0)",transformOrigin:"left"}}/>
            ))}
          </div>
        ):data.length>0?(
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-color)]/50 to-transparent"
                style={{position:"absolute",animation:"scan-sweep 5s ease-in-out infinite",animationDelay:"2s"}}/>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <AreaChart data={data} margin={{top:8,right:4,bottom:0,left:-18}}>
                <defs>
                  <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{fill:"#52525b",fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>String(v).slice(-5)}/>
                <YAxis domain={[minV-pad,maxV+pad]} tick={{fill:"#52525b",fontSize:9}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{backgroundColor:"#0F1520",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,fontSize:11}} labelStyle={{color:"#a1a1aa"}}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v:any)=>[`$${Number(v).toFixed(2)}`,"Price"]} cursor={{stroke:"rgba(255,255,255,0.08)"}}/>
                <Area type="monotone" dataKey="close" stroke="var(--accent-color)" strokeWidth={1.5} fill="url(#chartGrad)" dot={false} activeDot={{r:3,fill:"var(--accent-color)"}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ):(
          <div className="flex h-[340px] items-center justify-center text-xs text-zinc-600">No chart data for {symbol}</div>
        )}
      </div>
    </motion.div>
  );
}

// ── CENTER: Insider Trades ────────────────────────────────────────────────────

function InsiderTradesCard({delay}:{delay:number}) {
  const [trades,setTrades] = useState<any[]>([]);
  const [todayCount,setTodayCount] = useState(0);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    fetch("/api/insider-trades/congress").then(r=>r.json()).then(d=>{
      // API returns camelCase: { politician, ticker, transaction, amountRange, tradeDate, party, priceChange, excessReturn }
      const items:any[]=Array.isArray(d)?d:d?.trades??[];
      const today=new Date().toISOString().slice(0,10);
      setTodayCount(items.filter((t:any)=>(t.tradeDate??"").startsWith(today)).length);
      setTrades(items.slice(0,5));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  return (
    <BentoCard href="/insider-trades" title="Congressional Trades" icon={I.institution} delay={delay} loading={loading} className="min-h-[300px]">
      {todayCount>0&&(
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-[var(--accent-color)]/10 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-color)] sonar-dot text-[var(--accent-color)]"/>
          <span className="text-xs font-semibold text-[var(--accent-color)]">{todayCount} new trade{todayCount!==1?"s":""} today</span>
        </div>
      )}
      {trades.length===0?<Skel n={5}/>:(
        <ul className="space-y-2 pt-1">
          {trades.map((t:any,i:number)=>{
            const buy=(t.transaction??"").toLowerCase().includes("purchase")||(t.transaction??"").toLowerCase().includes("buy");
            const gl:number|null=t.priceChange??null;
            const glUp=gl!=null&&gl>=0;
            const date=t.tradeDate??"";
            return(
              <li key={i} className="flex items-center gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${(t.party??"").toLowerCase()==="r"?"text-red-400":(t.party??"").toLowerCase()==="d"?"text-blue-400":"text-zinc-300"}`}>{t.ticker??"—"}</span>
                    <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${buy?"bg-emerald-500/15 text-emerald-400":"bg-red-500/15 text-red-400"}`}>{buy?"BUY":"SELL"}</span>
                    {gl!=null&&<span title="% price change since trade date" className={`ml-auto text-[9px] font-bold ${glUp?"text-emerald-400":"text-red-400"}`}>{glUp?"+":""}{gl.toFixed(1)}% <span className="font-normal opacity-60">since trade</span></span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="truncate text-[10px] text-zinc-600">{t.politician??"Unknown"}</p>
                    {date&&<p className="shrink-0 text-[9px] text-zinc-700 ml-auto">{new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </BentoCard>
  );
}

// ── CENTER: FiscalWatch mini ──────────────────────────────────────────────────

function FiscalWatchCard({delay}:{delay:number}) {
  const [contracts,setContracts] = useState<{recipient:string;amount:number;date:string}[]>([]);
  const [loading,setLoading] = useState(true);

  useEffect(()=>{
    fetch("/api/fiscalwatch").then(r=>r.json()).then(d=>{
      // From the most recent batch, pick the 5 with the biggest amounts
      const ctrs=[...(d?.contracts??[])]
        .sort((a:any,b:any)=>b.amount-a.amount)
        .slice(0,5)
        .map((c:any)=>({recipient:c.recipient,amount:c.amount,date:c.date??""}));
      setContracts(ctrs);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const fmtAmt=(n:number)=>{
    if(n>=1e9) return`$${(n/1e9).toFixed(1)}B`;
    if(n>=1e6) return`$${(n/1e6).toFixed(0)}M`;
    return`$${n.toLocaleString()}`;
  };

  return (
    <BentoCard href="/fiscalwatch" title="FiscalWatch" icon={I.dollarSign} delay={delay} loading={loading} className="min-h-[240px]">
      <div className="pt-1">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Top Gov Contracts · Most Recent</p>
        {contracts.length>0?(
          <ul className="space-y-2.5">
            {contracts.map((c,i)=>(
              <li key={i} className="flex items-start justify-between gap-2 text-[10px]">
                <div className="min-w-0">
                  <p className="truncate text-zinc-300 leading-snug font-medium">{c.recipient}</p>
                  {c.date&&<p className="text-zinc-600">{new Date(c.date+"T12:00:00Z").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>}
                </div>
                <span className="shrink-0 font-bold text-red-400">{fmtAmt(c.amount)}</span>
              </li>
            ))}
          </ul>
        ):(
          <p className="text-[10px] text-zinc-600">Contract data loading…</p>
        )}
      </div>
    </BentoCard>
  );
}

// ── RIGHT: Market News ────────────────────────────────────────────────────────

function MarketNewsCard({delay}:{delay:number}) {
  const [news,setNews] = useState<NewsItem[]>([]);
  const [loading,setLoading] = useState(true);
  const [geo,setGeo] = useState(false);
  const load=useCallback((isGeo:boolean)=>{
    setLoading(true);
    fetch(`/api/news?category=${isGeo?"geopolitical":"all"}`).then(r=>r.json()).then(d=>{
      const items=Array.isArray(d)?d:d?.articles??d?.news??[];
      setNews(items.slice(0,7));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{load(geo);const id=setInterval(()=>load(geo),5*60*1000);return()=>clearInterval(id);},[geo,load]);
  return (
    <BentoCard href="/news" title="Market News" icon={I.newspaper} delay={delay} loading={loading} className="min-h-[420px]">
      <div className="mb-2 flex gap-1">
        {([{key:false,label:"Markets"},{key:true,label:"Geopolitical"}] as const).map(({key,label})=>(
          <button key={String(key)} onClick={e=>{e.stopPropagation();setGeo(key);}}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${geo===key?"bg-[var(--accent-color)]/20 text-[var(--accent-color)]":"text-zinc-600 hover:text-zinc-400"}`}>
            {label}
          </button>
        ))}
      </div>
      {news.length===0?<Skel n={6}/>:(
        <ul className="space-y-3">
          {news.map((n,i)=>(
            <li key={i} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
              <a href={n.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} className="block">
                <p className="line-clamp-2 text-xs font-medium leading-snug text-zinc-300 hover:text-[var(--accent-color)] transition-colors">{n.title}</p>
                <div className="mt-1 flex gap-2 text-[10px] text-zinc-700"><span>{n.source}</span><span>·</span><span>{timeAgo(n.publishedAt)}</span></div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ── RIGHT: Watchlist ──────────────────────────────────────────────────────────

function WatchlistCard({delay}:{delay:number}) {
  const { user } = useAuth();
  const [items,setItems] = useState<WatchItem[]>([]);
  const [loading,setLoading] = useState(true);

  const load=useCallback(async()=>{
    if(!user){setLoading(false);return;}
    try{
      const {fetchWatchlistWithStatus}=await import("../../lib/watchlist-api");
      const {items:wl}=await fetchWatchlistWithStatus();
      const tickers=wl.slice(0,6).map((w:any)=>w.ticker);
      const out:Record<string,Q>={};
      await Promise.allSettled(tickers.map(async(sym:string)=>{
        const r=await fetch(`/api/ticker-quote?symbol=${encodeURIComponent(sym)}`);
        if(r.ok)out[sym]=await r.json();
      }));
      setItems(tickers.map((sym:string)=>({ticker:sym,price:out[sym]?.price,changePercent:out[sym]?.changePercent})));
    }catch{}
    setLoading(false);
  },[user]);

  useEffect(()=>{load();const id=setInterval(load,60000);return()=>clearInterval(id);},[load]);

  return (
    <BentoCard href="/watchlist" title="My Watchlist" icon={I.star} delay={delay} loading={loading} className="min-h-[260px]">
      {items.length===0?<p className="pt-1 text-xs text-zinc-600">{user?"Add tickers to your watchlist":"Sign in to see watchlist"}</p>:(
        <ul className="space-y-1 pt-1">
          {items.map(item=>{const up=(item.changePercent??0)>=0;return(
            <li key={item.ticker} onClick={e=>{e.stopPropagation();window.location.assign(`/search/${encodeURIComponent(item.ticker)}`);}}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5 cursor-pointer">
              <span className="text-sm font-bold text-zinc-200">{item.ticker}</span>
              <div className="text-right">
                {item.price!=null&&<span className="text-xs text-zinc-400">{fmtPrice(item.price)}</span>}
                {item.changePercent!=null&&<span className={`ml-2 text-[10px] font-bold ${up?"text-emerald-400":"text-red-400"}`}>{fmtPct(item.changePercent)}</span>}
              </div>
            </li>
          );})}
        </ul>
      )}
    </BentoCard>
  );
}

// ── RIGHT: Communities ────────────────────────────────────────────────────────

const COMMUNITY_LIST = [
  {name:"Global Equities Flow",members:"1.2k",tag:"equities"},
  {name:"Global Macro & Rates",members:"640",tag:"macro"},
  {name:"Crypto & High-Beta",members:"480",tag:"crypto"},
  {name:"Energy & Commodities",members:"310",tag:"energy"},
];

function CommunitiesCard({delay}:{delay:number}) {
  return (
    <BentoCard href="/communities" title="Communities" icon={I.users} delay={delay} className="min-h-[200px]">
      <ul className="space-y-2 pt-1">
        {COMMUNITY_LIST.map(c=>(
          <li key={c.tag} onClick={e=>e.stopPropagation()} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
            <div><p className="text-xs font-medium text-zinc-300">{c.name}</p><p className="text-[10px] text-zinc-600">{c.members} members</p></div>
            <Link href="/communities" onClick={e=>e.stopPropagation()} className="rounded-full bg-[var(--accent-color)]/10 px-3 py-1 text-[10px] font-bold text-[var(--accent-color)] hover:bg-[var(--accent-color)]/20 transition">Join</Link>
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}

// ── RIGHT: Economic Calendar ──────────────────────────────────────────────────

function EconomicCalendarCard({delay}:{delay:number}) {
  const [events,setEvents] = useState<EconEvent[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    // Fetch a 30-day window (past 7 + next 30) so we always get events even if FRED dates shift
    const today=new Date();
    const from=new Date(today);from.setDate(from.getDate()-7);
    const to=new Date(today);to.setDate(to.getDate()+30);
    const fromStr=from.toISOString().slice(0,10);
    const toStr=to.toISOString().slice(0,10);
    fetch(`/api/calendar?type=economic&from=${fromStr}&to=${toStr}`).then(r=>r.json()).then(d=>{
      const items:EconEvent[]=Array.isArray(d)?d:d?.economic??d?.events??[];
      const todayStr=today.toISOString().slice(0,10);
      // Prefer upcoming, fall back to most recent past events if none upcoming
      const upcoming=items.filter((e:any)=>e?.date&&e.date>=todayStr).slice(0,5);
      setEvents(upcoming.length>0?upcoming:items.slice(-4));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  const dot=(impact:string)=>impact==="HIGH"?"bg-red-500":impact==="MEDIUM"?"bg-amber-500":"bg-emerald-500";
  return (
    <BentoCard href="/calendar" title="Economic Calendar" icon={I.calendar} delay={delay} loading={loading} className="min-h-[200px]">
      {events.length===0?<p className="pt-1 text-xs text-zinc-600">No events · check back soon</p>:(
        <ul className="space-y-2.5 pt-1">
          {events.map(ev=>(
            <li key={ev.id} className="flex items-start gap-2.5">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot(ev.impact)}`}/>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-300">{ev.name}</p>
                <p className="text-[10px] text-zinc-600">{new Date(ev.date+"T12:00:00Z").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} · {ev.country}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ── RIGHT: Sentiment Radar ────────────────────────────────────────────────────

function SentimentRadarCard({delay}:{delay:number}) {
  const [score,setScore] = useState<number|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    // bonds API includes a sentiment score
    fetch("/api/bonds").then(r=>r.json()).then(d=>{
      const s=d?.sentiment?.score;
      if(s!=null)setScore(Math.round(Number(s)));
    }).catch(()=>{}).finally(()=>setLoading(false));
    const id=setInterval(()=>fetch("/api/bonds").then(r=>r.json()).then(d=>{const s=d?.sentiment?.score;if(s!=null)setScore(Math.round(Number(s)));}).catch(()=>{}),5*60*1000);
    return()=>clearInterval(id);
  },[]);
  const color=score==null?"#52525b":score>=60?"#10b981":score>=40?"#f59e0b":"#ef4444";
  const label=score==null?"—":score>=70?"Bullish":score>=55?"Mildly Bullish":score>=45?"Neutral":score>=30?"Mildly Bearish":"Bearish";
  const animScore = useCountUp(score, 1500);
  return (
    <BentoCard href="/sentiment" title="Sentiment Radar" icon={I.target} delay={delay} loading={loading} className="min-h-[140px]">
      <div className="flex items-center gap-4 pt-1">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold" style={{borderColor:color,color}}>{score!=null?Math.round(animScore):48}</div>
        <div><p className="text-sm font-bold" style={{color}}>{label}</p><p className="mt-0.5 text-[10px] text-zinc-600">Market mood · 0–100</p></div>
      </div>
    </BentoCard>
  );
}

// ── RIGHT: Prediction Markets ─────────────────────────────────────────────────

function PredictionMarketsCard({delay}:{delay:number}) {
  const [preds,setPreds] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    fetch("/api/posts?limit=6").then(r=>r.json()).then(d=>{
      const items:any[]=Array.isArray(d)?d:d?.posts??[];
      const counts:Record<string,any>=d?.reactionCounts??{};
      const mapped=items.slice(0,6).map((p:any)=>{
        const rc=counts[p.id]??{};
        return {question:p.content??"Prediction",yes:rc.bullish??0,no:rc.bearish??0};
      }).filter(p=>p.yes>0||p.no>0).slice(0,3);
      setPreds(mapped.length>0?mapped:items.slice(0,3).map((p:any)=>({question:p.content??"—",yes:0,no:0})));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  return (
    <BentoCard href="/predict" title="PredictNow" icon={I.predict} delay={delay} loading={loading} className="min-h-[180px]">
      {preds.length===0?<p className="pt-1 text-xs text-zinc-600">No active predictions</p>:(
        <ul className="space-y-3 pt-1">
          {preds.map((p,i)=>{const total=p.yes+p.no||1;const pct=Math.round((p.yes/total)*100);return(
            <li key={i}>
              <p className="line-clamp-1 text-xs text-zinc-300 mb-1">{p.question}</p>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
                <div className="h-full bg-emerald-500 rounded-l-full" style={{width:`${pct}%`}}/>
                <div className="h-full bg-red-500 rounded-r-full" style={{width:`${100-pct}%`}}/>
              </div>
              <div className="mt-0.5 flex justify-between text-[9px]"><span className="text-emerald-500">Yes {pct}%</span><span className="text-red-500">No {100-pct}%</span></div>
            </li>
          );})}
        </ul>
      )}
    </BentoCard>
  );
}

// ── RIGHT: Trade Rooms ────────────────────────────────────────────────────────

function TradeRoomsCard({delay}:{delay:number}) {
  const [rooms,setRooms] = useState<any[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    fetch("/api/rooms/joined").then(r=>r.json()).then(d=>{
      const items=Array.isArray(d)?d:d?.rooms??[];
      setRooms(items.slice(0,4));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  return (
    <BentoCard href="/trade-rooms" title="Trade Rooms" icon={I.radio} delay={delay} loading={loading} className="min-h-[160px]">
      {rooms.length===0?<p className="pt-1 text-xs text-zinc-600">No active rooms</p>:(
        <ul className="space-y-2 pt-1">
          {rooms.map((r:any,i:number)=>(
            <li key={i} className="flex items-center justify-between text-xs">
              <div className="min-w-0"><p className="truncate font-medium text-zinc-300">{r.name??r.title??"Room"}</p><p className="text-[10px] text-zinc-600">{r.participant_count??r.members??0} live</p></div>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 sonar-dot text-emerald-500"/>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ── LEFT: Global Markets Globe ────────────────────────────────────────────────

const GLOBE_MARKETS = [
  {symbol:"EWJ",label:"Japan"},
  {symbol:"EWG",label:"Germany"},
  {symbol:"EWU",label:"UK"},
  {symbol:"FXI",label:"China"},
  {symbol:"EZU",label:"Eurozone"},
  {symbol:"EWA",label:"Australia"},
];

function GlobeCard({delay}:{delay:number}) {
  const [quotes,setQuotes] = useState<Record<string,Q>>({});
  const [loading,setLoading] = useState(true);

  const fetchAll=useCallback(async()=>{
    const out:Record<string,Q>={};
    await Promise.allSettled(GLOBE_MARKETS.map(async({symbol})=>{
      try{const r=await fetch(`/api/ticker-quote?symbol=${encodeURIComponent(symbol)}`);if(r.ok)out[symbol]=await r.json();}catch{}
    }));
    setQuotes(out);setLoading(false);
  },[]);

  useEffect(()=>{fetchAll();const id=setInterval(fetchAll,60000);return()=>clearInterval(id);},[fetchAll]);

  return (
    <BentoCard href="/map" title="Global Markets" icon={I.globe} delay={delay} loading={loading} className="min-h-[200px]">
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {GLOBE_MARKETS.map(({symbol,label})=>{
          const q=quotes[symbol];const up=(q?.changePercent??0)>=0;
          return(
            <div key={symbol} className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-[11px]">
              <span className="font-medium text-zinc-400">{label}</span>
              {q?.price!=null
                ?<div className="text-right">
                    <p className="text-zinc-300 font-semibold">{fmtPrice(q.price)}</p>
                    <p className={`text-[9px] font-bold ${up?"text-emerald-400":"text-red-400"}`}>{up?"+":""}{(q.changePercent??0).toFixed(2)}%</p>
                  </div>
                :<span className="text-zinc-700">—</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 sonar-dot text-emerald-500"/>
        Live · updates every 60s
      </div>
    </BentoCard>
  );
}

// ── RIGHT: DataHub ────────────────────────────────────────────────────────────

const DATA_SOURCES = [
  {name:"Earnings Calendar",tag:"earnings"},{name:"Global Trade Flows",tag:"trade"},
  {name:"Macro Indicators",tag:"macro"},{name:"Sector Heatmap",tag:"sectors"},
];

function DataHubCard({delay}:{delay:number}) {
  return (
    <BentoCard href="/datahub" title="DataHub" icon={I.database} delay={delay} className="min-h-[160px]">
      <ul className="space-y-1.5 pt-1">
        {DATA_SOURCES.map(d=>(
          <li key={d.tag} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-color)]/60"/>
            {d.name}
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}

// ── RIGHT: Backtest ───────────────────────────────────────────────────────────

const BACKTEST_PREVIEW = [
  {strategy:"SMA Crossover",ticker:"SPY",cagr:"+12.4%",sharpe:"1.31",win:"58%",up:true},
  {strategy:"RSI Reversion",ticker:"QQQ",cagr:"+9.8%",sharpe:"1.07",win:"54%",up:true},
  {strategy:"Momentum",ticker:"NVDA",cagr:"+21.3%",sharpe:"1.54",win:"61%",up:true},
  {strategy:"Buy & Hold",ticker:"AAPL",cagr:"+14.7%",sharpe:"0.92",win:"—",up:true},
];

function BacktestCard({delay}:{delay:number}) {
  return (
    <BentoCard href="/backtest" title="Backtesting Engine" icon={I.zap} delay={delay} className="min-h-[300px]">
      <p className="mb-3 text-[10px] text-zinc-600">Recent strategy results · click to run your own</p>
      <div className="space-y-2">
        {BACKTEST_PREVIEW.map((b,i)=>(
          <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-zinc-300">{b.strategy}</p>
                <p className="text-[9px] text-zinc-600">{b.ticker}</p>
              </div>
              <span className={`text-sm font-bold ${b.up?"text-emerald-400":"text-red-400"}`}>{b.cagr}</span>
            </div>
            <div className="mt-1.5 flex gap-3 text-[9px] text-zinc-600">
              <span>Sharpe <span className="text-zinc-400">{b.sharpe}</span></span>
              <span>Win Rate <span className="text-zinc-400">{b.win}</span></span>
            </div>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

// ── RIGHT: Market Rates ───────────────────────────────────────────────────────

function MarketRatesCard({delay}:{delay:number}) {
  const [yields,setYields] = useState<{label:string;value:number|null}[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    fetch("/api/bonds/history").then(r=>r.json()).then(d=>{
      const h:any[]=d?.history??[];
      const labels=["2Y","5Y","10Y","30Y"];
      setYields(labels.map(lbl=>{
        const series=h.find((s:any)=>s.label===lbl);
        const val=series?.data?.at(-1)?.value??null;
        return{label:lbl,value:val!=null?+val:null};
      }));
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[]);
  return (
    <BentoCard href="/bonds" title="Market Rates" icon={I.activity} delay={delay} loading={loading} className="min-h-[180px]">
      <div className="grid grid-cols-2 gap-2 pt-1">
        {(yields.length>0?yields:[{label:"2Y",value:null},{label:"5Y",value:null},{label:"10Y",value:null},{label:"30Y",value:null}]).map(r=>(
          <div key={r.label} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">US {r.label}</p>
            {r.value!=null
              ?<p className="mt-0.5 text-sm font-bold text-zinc-200">{r.value.toFixed(2)}<span className="ml-0.5 text-[9px] font-normal text-zinc-600">%</span></p>
              :<div className="mt-1 h-4 w-12 animate-pulse rounded bg-white/5"/>}
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

// ── LEFT: Screener Preview ────────────────────────────────────────────────────

function ScreenerPreviewCard({delay}:{delay:number}) {
  const [stocks,setStocks] = useState<{symbol:string;price:number|null;dayChangePct:number|null;sector:string|null}[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    // Use a small set of known movers via ticker-quote to avoid the heavy screener endpoint
    const TICKERS=["NVDA","META","TSLA","AMZN","MSFT","AAPL","AMD","PLTR"];
    const out:Record<string,any>={};
    Promise.allSettled(TICKERS.map(async sym=>{
      const r=await fetch(`/api/ticker-quote?symbol=${encodeURIComponent(sym)}`);
      if(r.ok)out[sym]=await r.json();
    })).then(()=>{
      const sorted=TICKERS.map(sym=>({symbol:sym,price:out[sym]?.price??null,dayChangePct:out[sym]?.changePercent??null,sector:null}))
        .filter(s=>s.price!=null).sort((a,b)=>Math.abs(b.dayChangePct??0)-Math.abs(a.dayChangePct??0)).slice(0,5);
      setStocks(sorted);
    }).finally(()=>setLoading(false));
  },[]);
  return (
    <BentoCard href="/screener" title="Stock Screener" icon={I.barChart} delay={delay} loading={loading} className="min-h-[240px]">
      {stocks.length===0?<p className="pt-1 text-xs text-zinc-600">Loading data…</p>:(
        <ul className="space-y-1 pt-1">
          {stocks.map(s=>{const up=(s.dayChangePct??0)>=0;return(
            <li key={s.symbol} onClick={e=>{e.stopPropagation();window.location.assign(`/search/${encodeURIComponent(s.symbol)}`);}}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5 cursor-pointer">
              <span className="text-sm font-bold text-zinc-200">{s.symbol}</span>
              <div className="text-right">
                <p className="text-xs text-zinc-400">{fmtPrice(s.price)}</p>
                <p className={`text-[10px] font-bold ${up?"text-emerald-400":"text-red-400"}`}>{up?"+":""}{(s.dayChangePct??0).toFixed(2)}%</p>
              </div>
            </li>
          );})}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-zinc-600">Open full screener to filter 200+ stocks →</p>
    </BentoCard>
  );
}

// ── RIGHT: Market Relations ────────────────────────────────────────────────────

type MRPair = { assetA: string; assetB: string; classA: string; classB: string; correlation: number };

const MR_CLASS_COLORS: Record<string, string> = {
  us_indices:"#6366f1", global_indices:"#8b5cf6", precious_metals:"#f59e0b",
  commodities:"#f97316", forex:"#06b6d4", bonds:"#3b82f6", crypto:"#a855f7", volatility:"#ef4444",
};

function detectMRRegime(perf: Record<string,Record<string,{["1m"]?:number|null}>>): {label:string;color:string;icon:string} {
  const spy = perf?.us_indices?.SPY?.["1m"] ?? 0;
  const tlt = perf?.bonds?.TLT?.["1m"] ?? 0;
  const gld = perf?.precious_metals?.GLD?.["1m"] ?? 0;
  const uso = perf?.commodities?.USO?.["1m"] ?? 0;
  const uup = perf?.forex?.UUP?.["1m"] ?? 0;
  if (spy < -4 && tlt > 2 && gld > 2)  return { label:"Risk-Off",   color:"#f87171", icon:"🔴" };
  if (uso > 5  && tlt < -2)             return { label:"Stagflation", color:"#fbbf24", icon:"🟡" };
  if (spy < -6 && uup > 3 && tlt > 4)  return { label:"Deflation",   color:"#a1a1aa", icon:"⚫" };
  if (spy > 3  && tlt < 0 && Math.abs(uup) < 2) return { label:"Risk-On", color:"#4ade80", icon:"🟢" };
  return { label:"Goldilocks", color:"#60a5fa", icon:"🔵" };
}

function MarketRelationsCard({delay}:{delay:number}) {
  const [pairs, setPairs]   = useState<MRPair[]>([]);
  const [regime, setRegime] = useState<{label:string;color:string;icon:string}|null>(null);
  const [total, setTotal]   = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), 20_000);
    fetch("/api/market-relations/correlations?days=90", { signal: ctrl.signal })
      .then(r=>r.json())
      .then(d=>{
        const sp: MRPair[] = d?.surprisingPairs ?? [];
        setPairs(sp.slice(0, 4));
        setTotal(sp.length);
        const perf = d?.performance ?? {};
        setRegime(detectMRRegime(perf));
      })
      .catch(()=>{})
      .finally(()=>{ clearTimeout(t); setLoading(false); });
    return ()=>ctrl.abort();
  },[]);

  return (
    <BentoCard href="/market-relations" title="Market Relations" icon={I.link} delay={delay} loading={loading} className="min-h-[260px]">
      {/* Regime badge */}
      {regime && (
        <div className="mb-3 flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{regime.icon}</span>
            <span className="text-xs font-semibold" style={{color:regime.color}}>{regime.label}</span>
            <span className="text-[10px] text-zinc-600">regime</span>
          </div>
          {total > 0 && (
            <span className="rounded-full bg-[var(--accent-color)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent-color)]">
              {total} surprising links
            </span>
          )}
        </div>
      )}

      {/* Surprising pairs list */}
      {pairs.length === 0 && !loading ? (
        <p className="pt-1 text-xs text-zinc-600">No cross-class correlations above threshold</p>
      ) : (
        <ul className="space-y-2">
          {pairs.map((p,i)=>{
            const clrA = MR_CLASS_COLORS[p.classA] ?? "#71717a";
            const clrB = MR_CLASS_COLORS[p.classB] ?? "#71717a";
            const absC = Math.abs(p.correlation);
            return (
              <li key={i} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
                <span className="text-[10px] font-bold" style={{color:clrA}}>{p.assetA}</span>
                <span className="text-[10px] font-black" style={{color:p.correlation>=0?"#4ade80":"#f87171"}}>
                  {p.correlation>=0?"↑↑":"↑↓"}
                </span>
                <span className="text-[10px] font-bold" style={{color:clrB}}>{p.assetB}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {/* Strength bar */}
                  <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{
                      width:`${absC*100}%`,
                      background:p.correlation>=0?"#4ade80":"#f87171",
                    }}/>
                  </div>
                  <span className={`tabular-nums text-[10px] font-semibold ${p.correlation>=0?"text-emerald-400":"text-red-400"}`}>
                    {(p.correlation>=0?"+":"")+p.correlation.toFixed(2)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-zinc-600">Cross-asset correlation intelligence →</p>
    </BentoCard>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BentoDashboardView() {
  const { scrollY } = useScroll();
  const leftY  = useTransform(scrollY, [0,1000], [0,-40]);
  const rightY = useTransform(scrollY, [0,1000], [0, 40]);

  return (
    <div className="relative overflow-x-hidden p-4 pb-16 md:p-6 md:pb-20" style={{ backgroundColor: "#070B14" }}>
      <ParallaxGrid />
      <AmbientParticles />
      <div className="relative z-[1]">
      <DashboardHeader />
      <MarketOpenFlash />

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,28%)_minmax(0,1fr)_minmax(0,28%)]">

        {/* ── LEFT COLUMN ── */}
        <motion.div className="flex min-w-0 flex-col gap-4" style={{ y: leftY }} initial={{x:-10}} animate={{x:0}} transition={{duration:0.55,ease:"easeOut"}}>
          <BondYieldCurveCard delay={0.05} />
          <GlobeCard          delay={0.08} />
          <CEOAlertsCard      delay={0.11} />
          <MessagesCard       delay={0.14} />
          <PriceAlertsCard    delay={0.18} />
          <JournalCard        delay={0.22} />
          <TradeRoomsCard     delay={0.25} />
          <CommunitiesCard    delay={0.27} />
          <DataHubCard        delay={0.29} />
        </motion.div>

        {/* ── CENTER COLUMN ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <SocialFeedCard    delay={0.00} />
          <LiveChartCard     delay={0.08} />
          <InsiderTradesCard delay={0.14} />
          <FiscalWatchCard   delay={0.20} />
        </div>

        {/* ── RIGHT COLUMN ── */}
        <motion.div className="flex min-w-0 flex-col gap-4" style={{ y: rightY }} initial={{x:10}} animate={{x:0}} transition={{duration:0.55,ease:"easeOut"}}>
          <MarketNewsCard        delay={0.05} />
          <WatchlistCard         delay={0.10} />
          <TopMoversCard         delay={0.14} />
          <MarketRatesCard       delay={0.17} />
          <ScreenerPreviewCard   delay={0.20} />
          <EconomicCalendarCard  delay={0.23} />
          <SentimentRadarCard    delay={0.26} />
          <PredictionMarketsCard delay={0.29} />
          <BacktestCard              delay={0.32} />
          <MarketRelationsCard       delay={0.35} />
        </motion.div>

      </div>
      </div>
    </div>
  );
}
