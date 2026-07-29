// src/pages/WheelPage.jsx — Public spin wheel with coupon + Facebook share
import { useState, useEffect, useRef, useCallback } from "react";
import { getRestaurantBySlug, createSpinSession, markFacebookShared } from "../lib/supabase";

const SEG_N   = 10;
const ARC_DEG = 360 / SEG_N;

// ── Spin logic ──
function pickSegIdx(segs, results, cfg) {
  const cap        = cfg.prizeCapEnabled ? (Number(cfg.prizeCap) || 100) : Infinity;
  const totalSpins = cfg.spinsPerVisit || 3;
  const spinsUsed  = results.length;
  const isLastSpin = spinsUsed === totalSpins - 1;
  const currentNet = results.reduce((s, r) => s + r.value, 0);
  const all        = segs.map((s, i) => ({ ...s, i }));
  const projected  = s => currentNet + s.value;

  const wPick = pool => {
    const ws = pool.map(s => s.weight || 1);
    const t  = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * t;
    for (let j = 0; j < ws.length; j++) { r -= ws[j]; if (r <= 0) return pool[j].i; }
    return pool[pool.length - 1].i;
  };

  if (isLastSpin) {
    const valid = all.filter(s => projected(s) > 0 && projected(s) <= cap);
    if (valid.length > 0) return wPick(valid);
    const below = all.filter(s => projected(s) > 0).sort((a, b) =>
      Math.abs(cap - projected(a)) - Math.abs(cap - projected(b)));
    return below.length > 0 ? below[0].i : all[0].i;
  } else {
    const safe = all.filter(s => projected(s) > 0 && projected(s) <= cap);
    if (safe.length > 0) return wPick(safe);
    const neg = all.filter(s => s.value < 0 && projected(s) > 0);
    if (neg.length > 0) return wPick(neg);
    return all[0].i;
  }
}

// ── Sound ──
function useSound() {
  const acRef = useRef(null);
  const getAc = useCallback(() => {
    if (!acRef.current) try { acRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    if (acRef.current?.state === "suspended") acRef.current.resume();
    return acRef.current;
  }, []);
  const tick = useCallback(() => {
    try {
      const c = getAc(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.value = 700 + Math.random() * 500;
      g.gain.setValueAtTime(0.06, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
      o.start(c.currentTime); o.stop(c.currentTime + 0.05);
    } catch {}
  }, [getAc]);
  const win = useCallback((jackpot) => {
    try {
      const c = getAc(); if (!c) return;
      (jackpot ? [523,659,784,1047,1319] : [523,659,784,1047]).forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = "sine"; o.connect(g); g.connect(c.destination); o.frequency.value = f;
        const t = c.currentTime + i * 0.11;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        o.start(t); o.stop(t + 0.35);
      });
    } catch {}
  }, [getAc]);
  const lose = useCallback(() => {
    try {
      const c = getAc(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sawtooth"; o.connect(g); g.connect(c.destination);
      o.frequency.setValueAtTime(280, c.currentTime);
      o.frequency.linearRampToValueAtTime(130, c.currentTime + 0.3);
      g.gain.setValueAtTime(0.08, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
      o.start(c.currentTime); o.stop(c.currentTime + 0.3);
    } catch {}
  }, [getAc]);
  return { tick, win, lose };
}

// ── Wheel Canvas ──
function WheelCanvas({ rotDeg, spinning, onSpin, spinsLeft, segs, totalSpins }) {
  const ref = useRef(null);
  const S = 300, C = 150, R = 120;
  const ARC = (2 * Math.PI) / SEG_N;

  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, S, S);

    // Outer glow ring
    ctx.save(); ctx.shadowColor = "#7dd3fc"; ctx.shadowBlur = 28;
    ctx.beginPath(); ctx.arc(C, C, R + 14, 0, 2 * Math.PI);
    const outerG = ctx.createLinearGradient(0, 0, S, S);
    outerG.addColorStop(0, "rgba(186,230,253,0.9)"); outerG.addColorStop(0.5, "rgba(56,189,248,0.9)"); outerG.addColorStop(1, "rgba(186,230,253,0.9)");
    ctx.fillStyle = outerG; ctx.fill(); ctx.restore();

    ctx.save(); ctx.beginPath(); ctx.arc(C, C, R + 10, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();

    segs.forEach((seg, i) => {
      const s = ARC * i - Math.PI / 2, e = s + ARC;
      ctx.save(); ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, R + 8, s, e); ctx.closePath();
      const segG = ctx.createRadialGradient(C, C, 10, C, C, R + 8);
      segG.addColorStop(0, hexToRgba(seg.color, 0.5)); segG.addColorStop(1, hexToRgba(seg.color, 1));
      ctx.fillStyle = segG; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, R + 8, s, e); ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();

      const mid = s + ARC / 2;
      const tx = C + Math.cos(mid) * R * 0.62, ty = C + Math.sin(mid) * R * 0.62;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(mid + Math.PI / 2);
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = seg.color; ctx.shadowBlur = 8; ctx.fillStyle = "#fff";
      const lbl = seg.label; const fs = lbl.length > 6 ? 8 : lbl.length > 4 ? 10 : 12;
      ctx.font = `900 ${fs}px 'Baloo Da 2',sans-serif`; ctx.fillText(lbl, 0, 0); ctx.restore();
    });

    // Hub
    ctx.save(); ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(C, C, 46, 0, 2 * Math.PI);
    const hubG = ctx.createRadialGradient(C, C, 0, C, C, 46);
    hubG.addColorStop(0, "rgba(125,211,252,0.95)"); hubG.addColorStop(0.5, "rgba(56,189,248,0.9)"); hubG.addColorStop(1, "rgba(7,89,133,0.9)");
    ctx.fillStyle = hubG; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(C, C, 46, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(186,230,253,0.8)"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#fff"; ctx.shadowBlur = 10; ctx.fillStyle = "#fff";
    ctx.font = `900 ${spinsLeft > 0 ? 14 : 10}px 'Baloo Da 2',sans-serif`;
    ctx.fillText(spinsLeft > 0 ? "SPIN" : "শেষ", C, C); ctx.restore();

  }, [JSON.stringify(segs), spinsLeft]);

  return (
    <div style={{ position:"relative", display:"inline-flex", justifyContent:"center" }}>
      <div style={{ position:"absolute", top:-8, left:"50%", transform:"translateX(-50%)", zIndex:10,
        filter:"drop-shadow(0 0 6px rgba(186,230,253,0.8))" }}>
        <div style={{ width:18, height:26, background:"linear-gradient(180deg,rgba(255,255,255,0.95),rgba(186,230,253,0.7))",
          clipPath:"polygon(50% 100%, 0% 0%, 100% 0%)" }} />
      </div>
      <canvas ref={ref} width={S} height={S} style={{
        transform:`rotate(${rotDeg}deg)`,
        transition: spinning ? "transform 5s cubic-bezier(0.10,0.68,0.06,1.0)" : "none",
        borderRadius:"50%", display:"block",
        cursor: spinsLeft > 0 && !spinning ? "pointer" : "default",
        filter:"drop-shadow(0 0 20px rgba(56,189,248,0.5))",
      }} onClick={() => spinsLeft > 0 && !spinning && onSpin()} />
    </div>
  );
}

// ── Confetti ──
function Confetti({ active }) {
  const pieces = useRef(Array.from({ length: 40 }, (_, i) => ({
    id:i, color:["#38bdf8","#14b8a6","#a855f7","#f97316","#eab308","#ec4899"][i%6],
    x: Math.random()*100, delay: Math.random()*1, size: 5+Math.random()*10, isCircle: Math.random()>.5,
  }))).current;
  if (!active) return null;
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:300, overflow:"hidden" }}>
      <style>{`@keyframes cfall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(115vh) rotate(720deg);opacity:0}}`}</style>
      {pieces.map(p => (
        <div key={p.id} style={{ position:"absolute", left:`${p.x}%`, top:"-20px",
          width:p.size, height:p.size, borderRadius:p.isCircle?"50%":"2px", background:p.color,
          animation:`cfall 2.8s ease-in ${p.delay}s forwards` }} />
      ))}
    </div>
  );
}

// ── Facebook Share Card Modal ──
function ShareModal({ restaurant, session, discount, onClose }) {
  const [shared, setShared] = useState(false);
  const shareUrl = `https://spinreward.com/r/${restaurant.slug}`;
  const shareText = `🎡 ${restaurant.name}-এ Lucky Spin খেলে আমি ৳${discount} ডিসকাউন্ট পেলাম! তুমিও চেষ্টা করো 👇\n${shareUrl}`;

  const handleShare = async () => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(fbUrl, "_blank", "width=600,height=400");
    if (session?.id) await markFacebookShared(session.id);
    setShared(true);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(12px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:20 }}>
      <div style={{ background:"rgba(13,47,74,0.95)", borderRadius:24, padding:"24px 20px",
        width:"100%", maxWidth:340, border:"1.5px solid rgba(56,189,248,0.3)",
        animation:"popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <style>{`@keyframes popIn{0%{transform:scale(0.5) translateY(30px);opacity:0}70%{transform:scale(1.04);opacity:1}100%{transform:scale(1) translateY(0)}}`}</style>

        {/* Share Card Preview */}
        <div style={{ background:"linear-gradient(135deg,#0ea5e9,#06b6d4,#14b8a6)", borderRadius:18,
          padding:"24px 20px", textAlign:"center", marginBottom:18,
          boxShadow:"0 0 30px rgba(14,165,233,0.4)" }}>
          <div style={{ fontSize:42, marginBottom:8 }}>🎡</div>
          <p style={{ fontSize:14, color:"rgba(255,255,255,0.8)", marginBottom:6 }}>
            {restaurant.name || "রেস্টুরেন্ট"}
          </p>
          <div style={{ fontSize:52, fontWeight:900, color:"#fff", textShadow:"0 0 20px rgba(255,255,255,0.5)" }}>
            ৳{discount}
          </div>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.75)", marginTop:6 }}>
            Lucky Spin-এ জিতলাম!
          </p>
          <div style={{ marginTop:12, background:"rgba(255,255,255,0.15)", borderRadius:12,
            padding:"8px 14px", fontSize:12, color:"rgba(255,255,255,0.9)" }}>
            👇 তুমিও চেষ্টা করো
          </div>
        </div>

        <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", textAlign:"center", marginBottom:16 }}>
          বন্ধুদের সাথে শেয়ার করুন এবং তাদেরও জেতার সুযোগ দিন!
        </p>

        {!shared ? (
          <button onClick={handleShare} style={{ width:"100%", padding:"14px", borderRadius:50,
            border:"none", background:"#1877f2", color:"#fff", fontWeight:900,
            fontSize:16, cursor:"pointer", fontFamily:"'Baloo Da 2',sans-serif",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow:"0 0 20px rgba(24,119,242,0.4)" }}>
            <span style={{ fontSize:20 }}>📘</span> Facebook-এ শেয়ার করুন
          </button>
        ) : (
          <div style={{ textAlign:"center", padding:"14px",
            background:"rgba(20,184,166,0.15)", borderRadius:14,
            border:"1px solid rgba(20,184,166,0.3)", color:"#5eead4", fontWeight:800, fontSize:14 }}>
            ✅ শেয়ার করা হয়েছে! ধন্যবাদ 🎉
          </div>
        )}

        <button onClick={onClose} style={{ width:"100%", marginTop:10, padding:"12px",
          borderRadius:50, background:"rgba(255,255,255,0.08)",
          border:"1px solid rgba(56,189,248,0.2)", color:"rgba(255,255,255,0.6)",
          fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"'Baloo Da 2',sans-serif" }}>
          বন্ধ করুন
        </button>
      </div>
    </div>
  );
}

// ── Coupon Modal ──
function CouponModal({ coupon, discount, restaurant, session, onShare, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(coupon);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(12px)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:250, padding:20 }}>
      <div style={{ background:"rgba(13,47,74,0.95)", borderRadius:24, padding:"28px 20px",
        width:"100%", maxWidth:340, border:"1.5px solid rgba(56,189,248,0.3)",
        animation:"popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <style>{`@keyframes popIn{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.04);opacity:1}100%{transform:scale(1);opacity:1}}`}</style>

        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:52 }}>🎉</div>
          <h2 style={{ fontSize:22, fontWeight:900, color:"#fff", marginTop:8 }}>অভিনন্দন!</h2>
          <p style={{ fontSize:14, color:"rgba(56,189,248,0.7)", marginTop:4 }}>
            আপনি জিতেছেন
          </p>
        </div>

        {/* Discount Display */}
        <div style={{ background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", borderRadius:18,
          padding:"20px", textAlign:"center", marginBottom:18,
          boxShadow:"0 0 30px rgba(14,165,233,0.4)" }}>
          <div style={{ fontSize:60, fontWeight:900, color:"#fff", lineHeight:1,
            textShadow:"0 0 20px rgba(255,255,255,0.4)" }}>৳{discount}</div>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.75)", marginTop:6 }}>ডিসকাউন্ট</p>
        </div>

        {/* Coupon Code */}
        <div style={{ marginBottom:16 }}>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:8, textAlign:"center" }}>
            আপনার কুপন কোড
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <div style={{ flex:1, background:"rgba(56,189,248,0.08)", border:"2px dashed rgba(56,189,248,0.4)",
              borderRadius:12, padding:"14px", textAlign:"center",
              fontSize:18, fontWeight:900, color:"#7dd3fc", letterSpacing:3, fontFamily:"monospace" }}>
              {coupon}
            </div>
            <button onClick={handleCopy}
              style={{ padding:"14px 16px", borderRadius:12, border:"none",
                background: copied ? "rgba(20,184,166,0.3)" : "rgba(56,189,248,0.15)",
                color: copied ? "#5eead4" : "#38bdf8", cursor:"pointer",
                fontSize:14, fontWeight:800, fontFamily:"'Baloo Da 2',sans-serif" }}>
              {copied ? "✓" : "📋"}
            </button>
          </div>
          <p style={{ fontSize:11, color:"rgba(255,255,255,0.3)", textAlign:"center", marginTop:8 }}>
            🧾 বিল পরিশোধের সময় ক্যাশিয়ারকে দেখান
          </p>
        </div>

        {/* Facebook Share */}
        <button onClick={onShare} style={{ width:"100%", padding:"13px", borderRadius:50,
          border:"none", background:"#1877f2", color:"#fff", fontWeight:800,
          fontSize:15, cursor:"pointer", fontFamily:"'Baloo Da 2',sans-serif",
          display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          marginBottom:10, boxShadow:"0 0 16px rgba(24,119,242,0.4)" }}>
          <span>📘</span> Facebook-এ শেয়ার করুন
        </button>

        <button onClick={onClose} style={{ width:"100%", padding:"12px", borderRadius:50,
          background:"rgba(255,255,255,0.06)", border:"1px solid rgba(56,189,248,0.2)",
          color:"rgba(255,255,255,0.5)", fontWeight:700, fontSize:14,
          cursor:"pointer", fontFamily:"'Baloo Da 2',sans-serif" }}>
          বন্ধ করুন
        </button>
      </div>
    </div>
  );
}

// ── Main WheelPage ──
export default function WheelPage({ slug }) {
  const [restaurant, setRestaurant] = useState(null);
  const [cfg, setCfg]               = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  // Game state
  const [rotDeg, setRotDeg]       = useState(0);
  const [spinning, setSpinning]   = useState(false);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const [totalSpins, setTotalSpins] = useState(3);
  const [results, setResults]     = useState([]);
  const [showCoupon, setShowCoupon] = useState(false);
  const [showShare, setShowShare]   = useState(false);
  const [couponData, setCouponData] = useState(null);
  const [sessionData, setSessionData] = useState(null);
  const [confetti, setConfetti]   = useState(false);
  const [gameOver, setGameOver]   = useState(false);

  const rotRef     = useRef(0);
  const tickRef    = useRef(null);
  const resultsRef = useRef([]);
  const sound      = useSound();

  useEffect(() => {
    if (!slug) { setError("invalid"); setLoading(false); return; }
    getRestaurantBySlug(slug).then(({ data, error: err }) => {
      if (err || !data) { setError("not_found"); setLoading(false); return; }
      setRestaurant(data);
      const c = data.wheel_configs;
      const config = {
        segments:       c.segments || [],
        spinsPerVisit:  c.spins_per_visit || 3,
        prizeCap:       c.prize_cap || 100,
        prizeCapEnabled: c.prize_cap_enabled !== false,
        brandName:      c.brand_name || data.name,
        brandTagline:   c.brand_tagline || "আজকের বিশেষ অফার জিতুন!",
        primaryColor:   c.primary_color || "#38bdf8",
        logoEmoji:      c.logo_emoji || "🍽️",
      };
      setCfg(config);
      setSpinsLeft(config.spinsPerVisit);
      setTotalSpins(config.spinsPerVisit);
      setLoading(false);
    });
    return () => clearTimeout(tickRef.current);
  }, [slug]);

  const net = Math.min(
    Math.max(resultsRef.current.reduce((s, r) => s + r.value, 0), 0),
    cfg?.prizeCapEnabled ? (cfg?.prizeCap || 100) : Infinity
  );

  const spin = () => {
    if (spinning || spinsLeft <= 0 || !cfg) return;
    const segs = cfg.segments;
    const idx  = pickSegIdx(segs, resultsRef.current, { ...cfg, spinsPerVisit: totalSpins });
    const seg  = segs[idx];

    const center = idx * ARC_DEG + ARC_DEG / 2;
    const jitter = (Math.random() - 0.5) * ARC_DEG * 0.5;
    const target = ((360 - center + jitter) % 360 + 360) % 360;
    const curMod = ((rotRef.current % 360) + 360) % 360;
    let delta    = (target - curMod + 360) % 360;
    if (delta < 60) delta += 360;
    const next   = rotRef.current + 5 * 360 + delta;
    rotRef.current = next;
    setRotDeg(next); setSpinning(true);

    // Tick sound during spin
    let delay = 70;
    const go = () => { sound.tick(); delay = Math.min(delay + 4, 300); tickRef.current = setTimeout(go, delay); };
    tickRef.current = setTimeout(go, delay);

    setTimeout(async () => {
      clearTimeout(tickRef.current);
      resultsRef.current = [...resultsRef.current, seg];
      setResults(p => [...p, seg]);
      const newSpinsLeft = spinsLeft - 1;
      setSpinsLeft(newSpinsLeft);
      setSpinning(false);

      if (seg.type === "negative") sound.lose();
      else { sound.win(seg.type === "jackpot"); if (seg.type === "jackpot") setConfetti(true); }

      // Last spin — generate coupon
      if (newSpinsLeft === 0) {
        setGameOver(true);
        const finalNet = Math.min(
          Math.max(resultsRef.current.reduce((s, r) => s + r.value, 0), 0),
          cfg.prizeCapEnabled ? (cfg.prizeCap || 100) : Infinity
        );
        if (finalNet > 0 && restaurant) {
          const { data } = await createSpinSession(restaurant.id, restaurant.slug, finalNet, totalSpins);
          if (data) {
            setCouponData({ code: data.coupon_code, discount: finalNet });
            setSessionData(data);
            setTimeout(() => setShowCoupon(true), 600);
          }
        }
      }
    }, 5100);
  };

  if (loading) return (
    <div style={darkBg}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:56, animation:"spin 1s linear infinite" }}>🎡</div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (error === "not_found") return (
    <div style={{ ...darkBg, flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:56 }}>😕</div>
      <h2 style={{ color:"#fff", fontWeight:900 }}>রেস্টুরেন্ট পাওয়া যায়নি</h2>
      <p style={{ color:"rgba(255,255,255,0.5)" }}>এই link-এর subscription সক্রিয় নেই।</p>
    </div>
  );

  const primary = cfg?.primaryColor || "#38bdf8";

  return (
    <div style={{ ...darkBg, alignItems:"center", justifyContent:"center", padding:"16px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+Da+2:wght@400;700;800;900&family=Noto+Sans+Bengali:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes neonPulse{0%,100%{box-shadow:0 0 30px rgba(14,165,233,0.6)}50%{box-shadow:0 0 50px rgba(14,165,233,0.9);transform:translateY(-2px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <Confetti active={confetti} />

      {/* Neon orbs */}
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"-15%", right:"-5%", width:350, height:350, borderRadius:"50%", background:"radial-gradient(circle,rgba(56,189,248,0.18),transparent 70%)" }} />
        <div style={{ position:"absolute", bottom:"-10%", left:"-8%", width:300, height:300, borderRadius:"50%", background:"radial-gradient(circle,rgba(20,184,166,0.15),transparent 70%)" }} />
      </div>

      <div style={{ width:"100%", maxWidth:400, position:"relative", zIndex:1, animation:"fadeUp 0.45s ease" }}>
        {/* Card */}
        <div style={{ background:"rgba(13,47,74,0.85)", backdropFilter:"blur(20px)",
          borderRadius:28, padding:"22px 18px",
          border:"1.5px solid rgba(56,189,248,0.2)",
          boxShadow:"0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(56,189,248,0.1)" }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", gap:12, paddingBottom:14,
            borderBottom:"1px solid rgba(56,189,248,0.12)", marginBottom:16 }}>
            <div style={{ width:44, height:44, borderRadius:"50%", display:"flex",
              alignItems:"center", justifyContent:"center", fontSize:22,
              background:"rgba(56,189,248,0.15)", border:`2px solid ${primary}`,
              boxShadow:`0 0 14px ${primary}40` }}>
              {cfg?.logoEmoji || "🍽️"}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:15, fontWeight:900, color:"#fff" }}>{cfg?.brandName || "রেস্টুরেন্ট"}</div>
              <div style={{ fontSize:12, color:"rgba(56,189,248,0.5)" }}>{cfg?.brandTagline}</div>
            </div>
            {net > 0 && (
              <div style={{ background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", borderRadius:20,
                padding:"5px 13px", color:"#fff", fontSize:14, fontWeight:900,
                boxShadow:"0 0 14px rgba(14,165,233,0.4)" }}>
                ৳{net}
              </div>
            )}
          </div>

          {/* Title + spin counter */}
          <div style={{ textAlign:"center", marginBottom:16 }}>
            <h2 style={{ fontSize:24, fontWeight:900, color:"#fff",
              textShadow:"0 0 20px rgba(56,189,248,0.7)", marginBottom:6 }}>Lucky Spin</h2>
            <p style={{ fontSize:13, fontWeight:800, color: spinsLeft > 0 ? "#7dd3fc" : "rgba(255,255,255,0.3)", marginBottom:10 }}>
              {spinsLeft}টি বাকি আছে
            </p>
            <div style={{ display:"flex", justifyContent:"center", gap:8 }}>
              {Array.from({ length: totalSpins }).map((_, i) => (
                <div key={i} style={{ width:30, height:30, borderRadius:"50%",
                  background: i < spinsLeft ? "linear-gradient(135deg,#0ea5e9,#14b8a6)" : "rgba(255,255,255,0.08)",
                  border:`2px solid ${i < spinsLeft ? "#38bdf8" : "rgba(255,255,255,0.12)"}`,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:13,
                  boxShadow: i < spinsLeft ? "0 0 10px rgba(56,189,248,0.6)" : "none",
                  transition:"all 0.4s" }}>
                  {i < spinsLeft ? "🎰" : "✓"}
                </div>
              ))}
            </div>
          </div>

          {/* Wheel */}
          <div style={{ display:"flex", justifyContent:"center", margin:"14px 0 16px" }}>
            <WheelCanvas rotDeg={rotDeg} spinning={spinning} onSpin={spin}
              spinsLeft={spinsLeft} segs={cfg?.segments || []} totalSpins={totalSpins} />
          </div>

          {/* SPIN Button */}
          <button onClick={spin} disabled={spinning || spinsLeft === 0}
            style={{ width:"100%", padding:"16px", borderRadius:50,
              background: spinning || spinsLeft === 0
                ? "rgba(255,255,255,0.08)"
                : "linear-gradient(135deg,#0ea5e9,#06b6d4,#14b8a6)",
              color: spinning || spinsLeft === 0 ? "rgba(255,255,255,0.3)" : "#fff",
              fontWeight:900, fontSize:18, border:"none",
              cursor: spinning || spinsLeft === 0 ? "not-allowed" : "pointer",
              fontFamily:"'Baloo Da 2',sans-serif",
              boxShadow: spinning || spinsLeft === 0 ? "none" : "0 0 30px rgba(14,165,233,0.6)",
              animation: !spinning && spinsLeft > 0 ? "neonPulse 2s infinite" : "none",
              transition:"all 0.3s", letterSpacing:2 }}>
            {spinning ? "⏳ ঘুরছে..." : spinsLeft > 0 ? "SPIN!" : gameOver ? "✅ সম্পন্ন" : "শেষ"}
          </button>

          {/* Show coupon again if game over */}
          {gameOver && couponData && (
            <button onClick={() => setShowCoupon(true)}
              style={{ width:"100%", marginTop:10, padding:"12px", borderRadius:50,
                background:"rgba(56,189,248,0.1)", border:"1px solid rgba(56,189,248,0.3)",
                color:"#7dd3fc", fontWeight:800, fontSize:14, cursor:"pointer",
                fontFamily:"'Baloo Da 2',sans-serif" }}>
              🎁 কুপন দেখুন
            </button>
          )}

          <p style={{ textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.15)", marginTop:8 }}>
            চাকায় ট্যাপ করুন অথবা বাটনে চাপুন
          </p>
        </div>

        {/* Footer */}
        <div style={{ textAlign:"center", marginTop:12 }}>
          <p style={{ fontSize:10, color:"rgba(255,255,255,0.15)" }}>Powered by SpinReward 🇧🇩</p>
        </div>
      </div>

      {/* Coupon Modal */}
      {showCoupon && couponData && (
        <CouponModal
          coupon={couponData.code}
          discount={couponData.discount}
          restaurant={restaurant}
          session={sessionData}
          onShare={() => { setShowCoupon(false); setShowShare(true); }}
          onClose={() => setShowCoupon(false)}
        />
      )}

      {/* Facebook Share Modal */}
      {showShare && (
        <ShareModal
          restaurant={restaurant}
          session={sessionData}
          discount={couponData?.discount || 0}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

const darkBg = { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
  background:"linear-gradient(160deg,#0a1f35,#0d2f4a,#071a2e)",
  fontFamily:"'Baloo Da 2','Noto Sans Bengali',sans-serif", color:"#fff" };
