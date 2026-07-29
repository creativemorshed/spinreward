// src/pages/Dashboard.jsx — Restaurant Owner Dashboard
import { useState, useEffect, useRef } from "react";
import { supabase, signOut, getRestaurantByOwner, updateWheelConfig, getAnalyticsSummary } from "../lib/supabase";

const COLORS = ["#3b82f6","#14b8a6","#ec4899","#f97316","#a855f7","#f43f5e","#eab308","#84cc16","#06b6d4","#22c55e"];
const DEFAULT_SEGMENTS = [
  { label:"৳10", value:10, color:"#3b82f6", type:"win",      weight:20 },
  { label:"৳20", value:20, color:"#14b8a6", type:"win",      weight:18 },
  { label:"-৳10",value:-10,color:"#ec4899", type:"negative", weight:10 },
  { label:"৳30", value:30, color:"#f97316", type:"win",      weight:14 },
  { label:"৳50", value:50, color:"#a855f7", type:"jackpot",  weight:8  },
  { label:"-৳20",value:-20,color:"#f43f5e", type:"negative", weight:8  },
  { label:"৳40", value:40, color:"#eab308", type:"win",      weight:10 },
  { label:"৳100",value:100,color:"#84cc16", type:"jackpot",  weight:4  },
  { label:"-৳5", value:-5, color:"#06b6d4", type:"negative", weight:8  },
  { label:"৳25", value:25, color:"#22c55e", type:"win",      weight:10 },
];

export default function Dashboard({ onLogout }) {
  const [rest, setRest]           = useState(null);
  const [summary, setSummary]     = useState(null);
  const [tab, setTab]             = useState("overview");
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState("");

  // Wheel config editable state
  const [segments, setSegments]   = useState(DEFAULT_SEGMENTS);
  const [brandName, setBrandName] = useState("");
  const [tagline, setTagline]     = useState("");
  const [color, setColor]         = useState("#38bdf8");
  const [spins, setSpins]         = useState("3");
  const [capOn, setCapOn]         = useState(true);
  const [cap, setCap]             = useState("50");
  const [adminPass, setAdminPass] = useState("admin123");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { onLogout(); return; }
    const { data } = await getRestaurantByOwner(session.user.id);
    if (!data) { setLoading(false); return; }
    setRest(data);
    const c = data.wheel_configs;
    if (c) {
      setSegments(c.segments || DEFAULT_SEGMENTS);
      setBrandName(c.brand_name || data.name);
      setTagline(c.brand_tagline || "আজকের বিশেষ অফার জিতুন!");
      setColor(c.primary_color || "#38bdf8");
      setSpins(String(c.spins_per_visit || 3));
      setCapOn(c.prize_cap_enabled !== false);
      setCap(String(c.prize_cap || 50));
      setAdminPass(c.admin_pass || "admin123");
    }
    const s = await getAnalyticsSummary(data.id);
    setSummary(s);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true); setSaveMsg("");
    await updateWheelConfig(rest.id, {
      segments, brand_name: brandName, brand_tagline: tagline,
      primary_color: color, spins_per_visit: parseInt(spins) || 3,
      prize_cap: parseInt(cap) || 50, prize_cap_enabled: capOn, admin_pass: adminPass,
    });
    setSaveMsg("✅ সংরক্ষিত!"); setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  };

  const handleLogout = async () => { await signOut(); onLogout(); };

  const wheelUrl   = `${window.location.origin}/r/${rest?.slug}`;
  const redeemUrl  = `${window.location.origin}/redeem`;
  const qrUrl      = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wheelUrl)}`;

  const trialEnd  = rest?.trial_end ? new Date(rest.trial_end) : null;
  const trialDays = trialEnd ? Math.max(0, Math.ceil((trialEnd - new Date()) / 86400000)) : 0;
  const isTrial   = rest?.subscription_status === "trial" && trialDays > 0;
  const isActive  = rest?.subscription_status === "active";

  if (loading) return (
    <div style={{ ...darkBg, alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:48, animation:"spin 1s linear infinite" }}>🎡</div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const T = (t) => ({
    padding:"10px 14px", borderRadius:10, border:"none", cursor:"pointer",
    fontSize:12, fontWeight:800, fontFamily:"inherit",
    background: tab===t ? "linear-gradient(135deg,#0ea5e9,#14b8a6)" : "rgba(255,255,255,0.06)",
    color: tab===t ? "#fff" : "rgba(255,255,255,0.5)",
    boxShadow: tab===t ? "0 0 14px rgba(14,165,233,0.4)" : "none",
  });

  return (
    <div style={{ ...darkBg, alignItems:"stretch", justifyContent:"flex-start", padding:0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+Da+2:wght@400;700;800;900&family=Noto+Sans+Bengali:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        input[type=number]::-webkit-inner-spin-button{opacity:0.5}
        input[type=color]{-webkit-appearance:none;}
        input[type=color]::-webkit-color-swatch-wrapper{padding:0;}
        input[type=color]::-webkit-color-swatch{border:none;border-radius:8px;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.3);border-radius:4px;}
      `}</style>

      {/* Navbar */}
      <nav style={{ background:"rgba(10,31,53,0.9)", backdropFilter:"blur(10px)",
        padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center",
        borderBottom:"1px solid rgba(56,189,248,0.12)", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22 }}>🎡</span>
          <div>
            <div style={{ fontSize:14, fontWeight:900, color:"#fff" }}>{rest?.name}</div>
            <div style={{ fontSize:10, color:"rgba(56,189,248,0.5)" }}>SpinReward Dashboard</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <a href={wheelUrl} target="_blank" rel="noreferrer"
            style={{ padding:"7px 12px", borderRadius:8, fontSize:11, fontWeight:800,
              background:"rgba(56,189,248,0.12)", color:"#38bdf8", textDecoration:"none",
              border:"1px solid rgba(56,189,248,0.25)" }}>
            🔗 Wheel
          </a>
          <a href={redeemUrl} target="_blank" rel="noreferrer"
            style={{ padding:"7px 12px", borderRadius:8, fontSize:11, fontWeight:800,
              background:"rgba(20,184,166,0.12)", color:"#14b8a6", textDecoration:"none",
              border:"1px solid rgba(20,184,166,0.25)" }}>
            🧾 Redeem
          </a>
          <button onClick={handleLogout}
            style={{ padding:"7px 12px", borderRadius:8, fontSize:11, fontWeight:700,
              background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
              color:"rgba(255,255,255,0.5)", cursor:"pointer", fontFamily:"inherit" }}>
            লগআউট
          </button>
        </div>
      </nav>

      {/* Trial banner */}
      {isTrial && (
        <div style={{ background:"rgba(234,179,8,0.12)", borderBottom:"1px solid rgba(234,179,8,0.25)",
          padding:"10px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <p style={{ fontSize:13, color:"#fde047", fontWeight:700 }}>
            ⏳ Trial-এ {trialDays} দিন বাকি
          </p>
          <button style={{ padding:"6px 16px", borderRadius:20, border:"none",
            background:"#ca8a04", color:"#fff", fontWeight:800, fontSize:12,
            cursor:"pointer", fontFamily:"inherit" }}>Upgrade →</button>
        </div>
      )}

      <div style={{ maxWidth:900, margin:"0 auto", padding:"20px 16px", width:"100%" }}>

        {/* Wheel URL */}
        <div style={{ background:"rgba(13,47,74,0.7)", borderRadius:16, padding:"14px 18px",
          marginBottom:16, border:"1px solid rgba(56,189,248,0.15)",
          display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
          <div>
            <p style={{ fontSize:11, color:"rgba(56,189,248,0.5)", fontWeight:700, marginBottom:4 }}>
              Customer Wheel Link
            </p>
            <p style={{ fontSize:13, fontWeight:800, color:"#7dd3fc" }}>{wheelUrl}</p>
          </div>
          <button onClick={() => navigator.clipboard.writeText(wheelUrl)}
            style={{ padding:"8px 16px", borderRadius:10, border:"none",
              background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", color:"#fff",
              fontWeight:800, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            📋 Copy
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          <button style={T("overview")}  onClick={() => setTab("overview")}>📊 Overview</button>
          <button style={T("rewards")}   onClick={() => setTab("rewards")}>🎡 Rewards</button>
          <button style={T("brand")}     onClick={() => setTab("brand")}>🎨 Brand</button>
          <button style={T("qr")}        onClick={() => setTab("qr")}>📱 QR Code</button>
          <button style={T("analytics")} onClick={() => setTab("analytics")}>📈 Analytics</button>
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && summary && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:16 }}>
              {[
                { icon:"🎡", label:"মোট Spin",      val: summary.totalSpins,    color:"#38bdf8" },
                { icon:"🧾", label:"Redeemed",       val: summary.totalRedeemed, color:"#14b8a6" },
                { icon:"📘", label:"Facebook Share", val: summary.totalShared,   color:"#1877f2" },
                { icon:"💰", label:"মোট ডিসকাউন্ট", val: `৳${summary.totalDiscount}`, color:"#a855f7" },
                { icon:"📅", label:"আজ Spin",        val: summary.todaySpins,    color:"#f97316" },
                { icon:"✅", label:"আজ Redeemed",    val: summary.todayRedeemed, color:"#22c55e" },
              ].map((s, i) => (
                <div key={i} style={{ background:"rgba(13,47,74,0.8)", borderRadius:14,
                  padding:"16px", textAlign:"center", border:`1px solid ${s.color}20` }}>
                  <div style={{ fontSize:26 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:s.color, marginTop:6 }}>{s.val}</div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Marketing insight */}
            <div style={{ background:"rgba(24,119,242,0.1)", borderRadius:16, padding:"16px 18px",
              border:"1px solid rgba(24,119,242,0.2)", marginBottom:16 }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#93c5fd", marginBottom:12 }}>
                📊 Marketing Performance
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {[
                  { label:"Redemption Rate", val: summary.totalSpins > 0 ? `${Math.round(summary.totalRedeemed/summary.totalSpins*100)}%` : "0%" },
                  { label:"Share Rate",      val: summary.totalSpins > 0 ? `${Math.round(summary.totalShared/summary.totalSpins*100)}%` : "0%" },
                ].map((m, i) => (
                  <div key={i} style={{ background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"10px" }}>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>{m.label}</div>
                    <div style={{ fontSize:20, fontWeight:900, color:"#60a5fa", marginTop:2 }}>{m.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent sessions */}
            <div style={{ background:"rgba(13,47,74,0.7)", borderRadius:16, padding:"16px",
              border:"1px solid rgba(56,189,248,0.1)" }}>
              <p style={{ fontWeight:800, fontSize:13, color:"#7dd3fc", marginBottom:14 }}>🕐 সাম্প্রতিক Spin</p>
              {summary.sessions.slice(0,8).length === 0 ? (
                <p style={{ textAlign:"center", color:"rgba(255,255,255,0.2)", padding:"20px 0", fontSize:13 }}>
                  এখনো কোনো spin হয়নি
                </p>
              ) : summary.sessions.slice(0,8).map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 0", borderBottom: i<7?"1px solid rgba(255,255,255,0.05)":"none" }}>
                  <div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.6)", fontFamily:"monospace" }}>
                      {s.coupon_code}
                    </div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2 }}>
                      {new Date(s.created_at).toLocaleString("bn-BD")}
                      {s.facebook_shared && " · 📘 শেয়ার"}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:14, fontWeight:900, color:"#7dd3fc" }}>৳{s.final_discount}</span>
                    <span style={{ fontSize:10, padding:"3px 8px", borderRadius:8, fontWeight:700,
                      background: s.is_redeemed?"rgba(20,184,166,0.2)":"rgba(255,255,255,0.06)",
                      color: s.is_redeemed?"#5eead4":"rgba(255,255,255,0.3)" }}>
                      {s.is_redeemed ? "✓ Used" : "Unused"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── REWARDS ── */}
        {tab === "rewards" && (
          <div style={{ background:"rgba(13,47,74,0.8)", borderRadius:16, padding:"20px",
            border:"1px solid rgba(56,189,248,0.15)" }}>
            <p style={{ fontWeight:800, fontSize:14, color:"#7dd3fc", marginBottom:16 }}>
              🎡 Wheel Segments (১০টি)
            </p>

            {/* Column headers */}
            <div style={{ display:"grid", gridTemplateColumns:"16px 1fr 80px 56px", gap:8,
              padding:"0 4px 8px", borderBottom:"1px solid rgba(255,255,255,0.08)", marginBottom:10 }}>
              <div/><div style={hdr}>পরিমাণ (৳)</div>
              <div style={hdr}>Weight</div><div style={hdr}>%</div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:7, marginBottom:20 }}>
              {segments.map((seg, i) => {
                const isNeg = seg.type === "negative";
                const total = segments.reduce((a,b) => a+(b.weight||0), 0);
                const pct   = total > 0 ? ((seg.weight/total)*100).toFixed(1) : "0.0";
                return (
                  <div key={i} style={{ background: isNeg?"rgba(239,68,68,0.08)":"rgba(255,255,255,0.04)",
                    borderRadius:12, padding:"10px 12px",
                    border:`1.5px solid ${isNeg?"rgba(239,68,68,0.2)":"rgba(56,189,248,0.1)"}` }}>
                    <div style={{ display:"grid", gridTemplateColumns:"16px 1fr 80px 56px", gap:8, alignItems:"center" }}>
                      <div style={{ width:13, height:13, borderRadius:"50%", background:seg.color, flexShrink:0 }} />
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:13, fontWeight:800, color:isNeg?"#f87171":"rgba(255,255,255,0.4)" }}>
                          {isNeg?"-৳":"৳"}
                        </span>
                        <input type="number" min={0} value={Math.abs(seg.value)}
                          onChange={e => {
                            const n = [...segments];
                            n[i] = { ...n[i], value: isNeg?-Math.abs(parseInt(e.target.value)||0):parseInt(e.target.value)||0,
                              label: `${isNeg?"-":""}৳${Math.abs(parseInt(e.target.value)||0)}` };
                            setSegments(n);
                          }}
                          style={{ width:"100%", background:"rgba(255,255,255,0.06)",
                            border:`1.5px solid ${isNeg?"rgba(239,68,68,0.3)":"rgba(56,189,248,0.2)"}`,
                            borderRadius:9, padding:"8px 10px", fontSize:15, outline:"none",
                            fontWeight:800, color:isNeg?"#f87171":"#fff", fontFamily:"inherit" }} />
                      </div>
                      <input type="number" min={1} value={seg.weight}
                        onChange={e => { const n=[...segments]; n[i]={...n[i],weight:parseInt(e.target.value)||1}; setSegments(n); }}
                        style={{ background:"rgba(255,255,255,0.06)", border:`1.5px solid ${seg.color}44`,
                          borderRadius:9, padding:"8px 6px", fontSize:13, outline:"none",
                          fontWeight:700, textAlign:"center", color:"#fff", fontFamily:"inherit" }} />
                      <div style={{ textAlign:"center", fontSize:12, fontWeight:700,
                        color:isNeg?"#f87171":"#4ade80",
                        background:isNeg?"rgba(239,68,68,0.1)":"rgba(74,222,128,0.1)",
                        borderRadius:8, padding:"6px 2px" }}>{pct}%</div>
                    </div>
                    <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:4, marginTop:8 }}>
                      <div style={{ height:"100%", borderRadius:4, background:seg.color,
                        width:`${Math.min((seg.weight/Math.max(segments.reduce((a,b)=>a+b.weight,0),1))*100,100)}%`,
                        transition:"width 0.2s" }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Spins */}
            <p style={{ fontWeight:800, fontSize:13, color:"#7dd3fc", marginBottom:10 }}>প্রতি ভিজিটে Spin</p>
            <div style={{ display:"flex", gap:8, marginBottom:20 }}>
              {[1,2,3].map(n => (
                <button key={n} onClick={() => setSpins(String(n))}
                  style={{ flex:1, padding:"10px", borderRadius:10,
                    border:`1.5px solid ${spins===String(n)?"#38bdf8":"rgba(56,189,248,0.15)"}`,
                    background:spins===String(n)?"rgba(56,189,248,0.15)":"transparent",
                    color:spins===String(n)?"#38bdf8":"rgba(255,255,255,0.4)",
                    fontWeight:800, fontSize:16, cursor:"pointer", fontFamily:"inherit" }}>
                  {n}
                </button>
              ))}
            </div>

            {/* Prize Cap */}
            <div style={{ background: capOn?"rgba(20,184,166,0.08)":"rgba(255,255,255,0.04)",
              borderRadius:14, padding:"14px",
              border:`1px solid ${capOn?"rgba(20,184,166,0.25)":"rgba(255,255,255,0.08)"}`,
              marginBottom:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                marginBottom:capOn?14:0 }}>
                <div>
                  <p style={{ fontSize:13, fontWeight:800, color:"#fff" }}>🎯 ফাইনাল Prize Cap</p>
                  <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:2 }}>
                    ফাইনাল ডিসকাউন্ট এর বেশি যাবে না
                  </p>
                </div>
                <div onClick={() => setCapOn(v=>!v)}
                  style={{ width:44, height:24, borderRadius:12, cursor:"pointer",
                    background:capOn?"#0ea5e9":"rgba(255,255,255,0.15)",
                    position:"relative", transition:"background 0.3s" }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff",
                    position:"absolute", top:3, left:capOn?23:3, transition:"left 0.3s",
                    boxShadow:"0 1px 4px rgba(0,0,0,0.3)" }} />
                </div>
              </div>
              {capOn && (
                <>
                  <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                    {[25,50,75,100].map(v => (
                      <button key={v} onClick={() => setCap(String(v))}
                        style={{ flex:1, padding:"10px 4px", borderRadius:10, fontSize:14,
                          fontWeight:800, cursor:"pointer", fontFamily:"inherit",
                          border:`1.5px solid ${cap===String(v)?"#0ea5e9":"rgba(56,189,248,0.15)"}`,
                          background:cap===String(v)?"rgba(14,165,233,0.2)":"transparent",
                          color:cap===String(v)?"#38bdf8":"rgba(255,255,255,0.4)" }}>
                        ৳{v}
                      </button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center",
                    background:"rgba(255,255,255,0.05)", borderRadius:10, padding:"10px 12px",
                    border:"1px solid rgba(56,189,248,0.15)" }}>
                    <span style={{ fontSize:13, color:"rgba(255,255,255,0.3)" }}>কাস্টম ৳</span>
                    <input type="number" min={1}
                      value={[25,50,75,100].includes(Number(cap))?"":cap}
                      onChange={e => setCap(e.target.value)}
                      placeholder="যেমন: 150"
                      style={{ flex:1, background:"transparent", border:"none",
                        fontSize:15, fontWeight:800, outline:"none",
                        fontFamily:"inherit", color:"#38bdf8" }} />
                  </div>
                </>
              )}
            </div>

            {saveMsg && <div style={{ background:"rgba(20,184,166,0.15)", border:"1px solid rgba(20,184,166,0.3)",
              borderRadius:10, padding:"10px", fontSize:13, color:"#5eead4",
              fontWeight:700, textAlign:"center", marginBottom:12 }}>{saveMsg}</div>}

            <button onClick={handleSave} disabled={saving}
              style={{ width:"100%", padding:"14px", borderRadius:50, border:"none",
                background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", color:"#fff",
                fontWeight:900, fontSize:15, cursor:"pointer", fontFamily:"inherit",
                boxShadow:"0 0 20px rgba(14,165,233,0.4)", opacity:saving?0.7:1 }}>
              {saving?"⏳ সংরক্ষণ হচ্ছে...":"✓ সংরক্ষণ করুন"}
            </button>
          </div>
        )}

        {/* ── BRAND ── */}
        {tab === "brand" && (
          <div style={{ background:"rgba(13,47,74,0.8)", borderRadius:16, padding:"20px",
            border:"1px solid rgba(56,189,248,0.15)",
            display:"flex", flexDirection:"column", gap:16 }}>

            {[
              { label:"রেস্টুরেন্টের নাম", val:brandName, set:setBrandName, ph:"সাম্পান রেস্টুরেন্ট" },
              { label:"ট্যাগলাইন",         val:tagline,   set:setTagline,   ph:"আজকের বিশেষ অফার জিতুন!" },
              { label:"Admin পাসওয়ার্ড",    val:adminPass, set:setAdminPass, ph:"admin123" },
            ].map((f,i) => (
              <div key={i}>
                <label style={lbl}>{f.label}</label>
                <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} style={inp} />
              </div>
            ))}

            <div>
              <label style={lbl}>প্রধান রং</label>
              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <input type="color" value={color} onChange={e=>setColor(e.target.value)}
                  style={{ width:44, height:44, borderRadius:10,
                    border:"1.5px solid rgba(56,189,248,0.2)", cursor:"pointer", padding:2,
                    background:"transparent" }} />
                {["#38bdf8","#14b8a6","#a855f7","#f97316","#ec4899","#22c55e","#eab308"].map(c => (
                  <div key={c} onClick={() => setColor(c)}
                    style={{ width:32, height:32, borderRadius:"50%", background:c, cursor:"pointer",
                      border:color===c?"3px solid #fff":"2px solid transparent",
                      boxShadow:color===c?"0 0 10px rgba(255,255,255,0.4)":"none",
                      transition:"all 0.2s", flexShrink:0 }} />
                ))}
              </div>
            </div>

            {saveMsg && <div style={{ background:"rgba(20,184,166,0.15)", border:"1px solid rgba(20,184,166,0.3)",
              borderRadius:10, padding:"10px", fontSize:13, color:"#5eead4", fontWeight:700, textAlign:"center" }}>{saveMsg}</div>}

            <button onClick={handleSave} disabled={saving}
              style={{ padding:"14px", borderRadius:50, border:"none",
                background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", color:"#fff",
                fontWeight:900, fontSize:15, cursor:"pointer", fontFamily:"inherit",
                boxShadow:"0 0 20px rgba(14,165,233,0.4)" }}>
              {saving?"⏳ সংরক্ষণ হচ্ছে...":"✓ সংরক্ষণ করুন"}
            </button>
          </div>
        )}

        {/* ── QR CODE ── */}
        {tab === "qr" && (
          <div style={{ background:"rgba(13,47,74,0.8)", borderRadius:16, padding:"24px",
            border:"1px solid rgba(56,189,248,0.15)", textAlign:"center" }}>
            <p style={{ fontWeight:800, fontSize:14, color:"#7dd3fc", marginBottom:20 }}>
              📱 QR Code — টেবিলে প্রিন্ট করে রাখুন
            </p>
            <div style={{ display:"inline-block", background:"#fff", borderRadius:16, padding:16,
              boxShadow:"0 0 30px rgba(56,189,248,0.3)", marginBottom:20 }}>
              <img src={qrUrl} alt="QR Code" style={{ width:200, height:200, display:"block" }} />
            </div>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginBottom:20 }}>
              কাস্টমার এই QR scan করলে সরাসরি Spin Wheel খুলবে
            </p>
            <div style={{ background:"rgba(56,189,248,0.08)", borderRadius:12, padding:"12px 16px",
              border:"1px solid rgba(56,189,248,0.2)", marginBottom:16 }}>
              <p style={{ fontSize:12, color:"rgba(56,189,248,0.6)", marginBottom:4 }}>Wheel URL</p>
              <p style={{ fontSize:13, fontWeight:800, color:"#7dd3fc", wordBreak:"break-all" }}>{wheelUrl}</p>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              <a href={qrUrl} download="spinreward-qr.png"
                style={{ padding:"12px 24px", borderRadius:50, border:"none",
                  background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", color:"#fff",
                  fontWeight:800, fontSize:14, cursor:"pointer", textDecoration:"none",
                  boxShadow:"0 0 16px rgba(14,165,233,0.4)" }}>
                ⬇️ QR Download করুন
              </a>
              <button onClick={() => navigator.clipboard.writeText(wheelUrl)}
                style={{ padding:"12px 24px", borderRadius:50,
                  border:"1px solid rgba(56,189,248,0.3)",
                  background:"rgba(56,189,248,0.08)", color:"#38bdf8",
                  fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                📋 Link Copy করুন
              </button>
            </div>
            <div style={{ marginTop:20, background:"rgba(255,165,0,0.08)", border:"1px solid rgba(255,165,0,0.2)",
              borderRadius:12, padding:"12px 16px", textAlign:"left" }}>
              <p style={{ fontSize:12, color:"#fde047", fontWeight:600 }}>
                💡 <strong>Cashier Redeem Portal:</strong> <a href={redeemUrl} style={{ color:"#38bdf8" }}>{redeemUrl}</a><br/>
                এই link-এ কুপন কোড verify করুন।
              </p>
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === "analytics" && summary && (
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12 }}>
              {[
                { icon:"🎡", label:"মোট Spin",         val:summary.totalSpins,    color:"#38bdf8" },
                { icon:"🧾", label:"মোট Redeemed",      val:summary.totalRedeemed, color:"#14b8a6" },
                { icon:"📘", label:"Facebook Shares",   val:summary.totalShared,   color:"#1877f2" },
                { icon:"💰", label:"মোট ডিসকাউন্ট দেওয়া",val:`৳${summary.totalDiscount}`,color:"#a855f7" },
              ].map((s,i)=>(
                <div key={i} style={{ background:"rgba(13,47,74,0.8)", borderRadius:14, padding:"16px",
                  textAlign:"center", border:`1px solid ${s.color}20` }}>
                  <div style={{ fontSize:26 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:s.color, marginTop:6 }}>{s.val}</div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontWeight:700, marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ background:"rgba(13,47,74,0.8)", borderRadius:16, padding:"16px",
              border:"1px solid rgba(56,189,248,0.1)" }}>
              <p style={{ fontWeight:800, marginBottom:14, fontSize:13, color:"#7dd3fc" }}>
                📋 সব Spin History
              </p>
              {summary.sessions.length === 0 ? (
                <p style={{ textAlign:"center", color:"rgba(255,255,255,0.2)", padding:"30px 0", fontSize:13 }}>
                  এখনো কোনো spin হয়নি
                </p>
              ) : summary.sessions.map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"10px 0", borderBottom:i<summary.sessions.length-1?"1px solid rgba(255,255,255,0.05)":"none" }}>
                  <div>
                    <div style={{ fontSize:12, fontFamily:"monospace", color:"#7dd3fc", fontWeight:700 }}>
                      {s.coupon_code}
                    </div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:2 }}>
                      {new Date(s.created_at).toLocaleString("bn-BD")}
                      {s.facebook_shared && " · 📘"}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{ fontWeight:900, color:"#7dd3fc" }}>৳{s.final_discount}</span>
                    <span style={{ fontSize:10, padding:"3px 8px", borderRadius:6, fontWeight:700,
                      background:s.is_redeemed?"rgba(20,184,166,0.2)":"rgba(255,255,255,0.06)",
                      color:s.is_redeemed?"#5eead4":"rgba(255,255,255,0.3)" }}>
                      {s.is_redeemed?"✓":"○"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const darkBg = { minHeight:"100vh", background:"linear-gradient(160deg,#0a1f35,#0d2f4a,#071a2e)",
  fontFamily:"'Baloo Da 2','Noto Sans Bengali',sans-serif", color:"#fff" };
const hdr   = { fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.3)" };
const lbl   = { fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.5)", display:"block", marginBottom:6 };
const inp   = { width:"100%", border:"1.5px solid rgba(56,189,248,0.2)", borderRadius:12,
  padding:"12px 14px", fontSize:14, outline:"none",
  fontFamily:"'Baloo Da 2',sans-serif", background:"rgba(56,189,248,0.05)",
  color:"#fff", boxSizing:"border-box" };
