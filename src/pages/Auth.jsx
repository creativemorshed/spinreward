// src/pages/Auth.jsx
import { useState } from "react";
import { signUp, signIn, supabase } from "../lib/supabase";

const DEFAULT_SEGMENTS = [
  { label:"৳10",  value:10,  color:"#3b82f6", type:"win",      weight:20 },
  { label:"৳20",  value:20,  color:"#14b8a6", type:"win",      weight:18 },
  { label:"-৳10", value:-10, color:"#ec4899", type:"negative", weight:10 },
  { label:"৳30",  value:30,  color:"#f97316", type:"win",      weight:14 },
  { label:"৳50",  value:50,  color:"#a855f7", type:"jackpot",  weight:8  },
  { label:"-৳20", value:-20, color:"#f43f5e", type:"negative", weight:8  },
  { label:"৳40",  value:40,  color:"#eab308", type:"win",      weight:10 },
  { label:"৳100", value:100, color:"#84cc16", type:"jackpot",  weight:4  },
  { label:"-৳5",  value:-5,  color:"#06b6d4", type:"negative", weight:8  },
  { label:"৳25",  value:25,  color:"#22c55e", type:"win",      weight:10 },
];

export default function Auth({ mode = "login", onSuccess }) {
  const [isLogin, setIsLogin]   = useState(mode === "login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [slug, setSlug]         = useState("");
  const [phone, setPhone]       = useState("");
  const [plan, setPlan]         = useState("basic");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const makeSlug = v => v.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"").slice(0,30);

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) throw error;
        onSuccess();
      } else {
        if (!name || !slug || !email || !password) throw new Error("সব তথ্য পূরণ করুন");
        if (password.length < 6) throw new Error("পাসওয়ার্ড কমপক্ষে ৬ অক্ষর");

        const { data: authData, error: authErr } = await signUp(email, password);
        if (authErr) throw authErr;

        const { error: restErr } = await supabase.from("restaurants").insert({
          owner_id: authData.user.id, name, slug, email, phone,
          subscription_status: "trial", subscription_plan: plan,
        });
        if (restErr) throw restErr;

        const { data: rest } = await supabase
          .from("restaurants").select("id").eq("owner_id", authData.user.id).single();

        await supabase.from("wheel_configs").insert({
          restaurant_id:    rest.id,
          brand_name:       name,
          brand_tagline:    "আজকের বিশেষ অফার জিতুন!",
          primary_color:    "#38bdf8",
          spins_per_visit:  3,
          prize_cap:        50,
          prize_cap_enabled: true,
          admin_pass:       "admin123",
          segments:         DEFAULT_SEGMENTS,
        });
        onSuccess();
      }
    } catch (e) { setError(e.message || "কিছু একটা সমস্যা হয়েছে"); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center", padding:20,
      background:"linear-gradient(160deg,#0a1f35,#0d2f4a,#071a2e)",
      fontFamily:"'Baloo Da 2','Noto Sans Bengali',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+Da+2:wght@400;700;800;900&family=Noto+Sans+Bengali:wght@400;700;800&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{ background:"rgba(13,47,74,0.85)", backdropFilter:"blur(20px)",
        borderRadius:24, padding:"32px 26px", width:"100%", maxWidth:420,
        border:"1.5px solid rgba(56,189,248,0.2)",
        boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <span style={{ fontSize:40 }}>🎡</span>
          <h2 style={{ fontSize:22, fontWeight:900, marginTop:8, color:"#fff" }}>
            {isLogin ? "লগইন করুন" : "নতুন অ্যাকাউন্ট"}
          </h2>
          <p style={{ fontSize:13, color:"rgba(56,189,248,0.6)", marginTop:4 }}>SpinReward SaaS</p>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {!isLogin && (
            <>
              <Field label="রেস্টুরেন্টের নাম" value={name} onChange={e => { setName(e.target.value); setSlug(makeSlug(e.target.value)); }} placeholder="সাম্পান রেস্টুরেন্ট" />
              <div>
                <label style={lbl}>আপনার URL</label>
                <div style={{ display:"flex", alignItems:"center", border:"1.5px solid rgba(56,189,248,0.2)", borderRadius:10, overflow:"hidden" }}>
                  <span style={{ padding:"11px 10px", background:"rgba(56,189,248,0.08)", fontSize:11, color:"rgba(56,189,248,0.5)", whiteSpace:"nowrap" }}>spinreward.com/r/</span>
                  <input style={{ ...inp, border:"none", flex:1 }} placeholder="sampan" value={slug} onChange={e => setSlug(makeSlug(e.target.value))} />
                </div>
              </div>
              <Field label="ফোন" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
              <div>
                <label style={lbl}>প্ল্যান</label>
                <div style={{ display:"flex", gap:8 }}>
                  {[{k:"basic",l:"Basic ৳499"},{k:"standard",l:"Standard ৳999"},{k:"premium",l:"Premium ৳1999"}].map(p => (
                    <button key={p.k} onClick={() => setPlan(p.k)}
                      style={{ flex:1, padding:"9px 4px", borderRadius:10, fontSize:11,
                        fontWeight:800, cursor:"pointer", fontFamily:"inherit",
                        border:`1.5px solid ${plan===p.k?"#38bdf8":"rgba(56,189,248,0.2)"}`,
                        background: plan===p.k?"rgba(56,189,248,0.15)":"transparent",
                        color: plan===p.k?"#38bdf8":"rgba(255,255,255,0.5)" }}>
                      {p.l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <Field label="ইমেইল" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          <Field label="পাসওয়ার্ড" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="কমপক্ষে ৬ অক্ষর" onKeyDown={e => e.key==="Enter" && handleSubmit()} />
        </div>

        {error && <div style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:"10px 14px", marginTop:14, fontSize:13, color:"#f87171", fontWeight:600 }}>⚠️ {error}</div>}

        <button onClick={handleSubmit} disabled={loading}
          style={{ width:"100%", marginTop:18, padding:"14px", borderRadius:50,
            border:"none", background: loading?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#0ea5e9,#14b8a6)",
            color: loading?"rgba(255,255,255,0.3)":"#fff", fontWeight:900, fontSize:16,
            cursor:loading?"not-allowed":"pointer", fontFamily:"inherit",
            boxShadow:loading?"none":"0 0 24px rgba(14,165,233,0.5)" }}>
          {loading ? "⏳ অপেক্ষা করুন..." : isLogin ? "লগইন →" : "অ্যাকাউন্ট তৈরি →"}
        </button>

        <p style={{ textAlign:"center", fontSize:13, marginTop:16, color:"rgba(255,255,255,0.4)" }}>
          {isLogin ? "অ্যাকাউন্ট নেই?" : "আগে থেকে আছে?"}
          <button onClick={() => { setIsLogin(!isLogin); setError(""); }}
            style={{ background:"none", border:"none", color:"#38bdf8", fontWeight:800, cursor:"pointer", marginLeft:6, fontFamily:"inherit" }}>
            {isLogin ? "রেজিস্ট্রেশন করুন" : "লগইন করুন"}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type="text", onKeyDown }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        onKeyDown={onKeyDown} style={inp} />
    </div>
  );
}

const lbl = { fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.6)", display:"block", marginBottom:6 };
const inp = { width:"100%", border:"1.5px solid rgba(56,189,248,0.2)", borderRadius:10,
  padding:"11px 14px", fontSize:14, outline:"none",
  fontFamily:"'Baloo Da 2',sans-serif", background:"rgba(56,189,248,0.05)",
  color:"#fff", boxSizing:"border-box" };
