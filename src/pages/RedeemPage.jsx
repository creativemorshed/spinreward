// src/pages/RedeemPage.jsx — Cashier coupon verification page
import { useState, useEffect } from "react";
import { getCouponInfo, redeemCoupon } from "../lib/supabase";

export default function RedeemPage({ coupon: initialCoupon }) {
  const [code, setCode]       = useState(initialCoupon || "");
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (initialCoupon) handleSearch(initialCoupon);
  }, []);

  const handleSearch = async (c = code) => {
    if (!c.trim()) return;
    setLoading(true); setError(""); setInfo(null); setSuccess(false);
    const { data, error: err } = await getCouponInfo(c.trim().toUpperCase());
    if (err || !data) setError("এই কুপন কোড পাওয়া যায়নি।");
    else setInfo(data);
    setLoading(false);
  };

  const handleRedeem = async () => {
    setLoading(true);
    const { data, error: err } = await redeemCoupon(info.coupon_code);
    if (err || !data) setError("কুপন redeem করা যায়নি। হয়তো আগেই ব্যবহার হয়েছে।");
    else { setSuccess(true); setInfo(data); }
    setLoading(false);
  };

  const timeAgo = (date) => {
    const mins = Math.floor((new Date() - new Date(date)) / 60000);
    if (mins < 60) return `${mins} মিনিট আগে`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} ঘণ্টা আগে`;
    return `${Math.floor(hrs / 24)} দিন আগে`;
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(160deg,#0a1f35,#0d2f4a,#071a2e)", padding:20,
      fontFamily:"'Baloo Da 2','Noto Sans Bengali',sans-serif", color:"#fff" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+Da+2:wght@400;700;800;900&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>

      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ background:"rgba(13,47,74,0.9)", backdropFilter:"blur(20px)",
          borderRadius:24, padding:"28px 22px",
          border:"1.5px solid rgba(56,189,248,0.2)",
          boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>

          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ fontSize:40 }}>🧾</div>
            <h2 style={{ fontSize:20, fontWeight:900, color:"#fff", marginTop:8 }}>Coupon Verify</h2>
            <p style={{ fontSize:13, color:"rgba(56,189,248,0.6)", marginTop:4 }}>ক্যাশিয়ার পোর্টাল</p>
          </div>

          {/* Search */}
          <div style={{ display:"flex", gap:8, marginBottom:20 }}>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="কুপন কোড লিখুন..."
              style={{ flex:1, background:"rgba(56,189,248,0.08)",
                border:"1.5px solid rgba(56,189,248,0.25)", borderRadius:12,
                padding:"12px 14px", fontSize:15, outline:"none", color:"#fff",
                fontFamily:"monospace", letterSpacing:2 }} />
            <button onClick={() => handleSearch()}
              style={{ padding:"12px 18px", borderRadius:12, border:"none",
                background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", color:"#fff",
                fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
              {loading ? "⏳" : "🔍"}
            </button>
          </div>

          {error && (
            <div style={{ background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)",
              borderRadius:12, padding:"12px 16px", fontSize:13, color:"#f87171",
              fontWeight:600, marginBottom:16, textAlign:"center" }}>
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div style={{ background:"rgba(20,184,166,0.15)", border:"1px solid rgba(20,184,166,0.4)",
              borderRadius:16, padding:"20px", textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
              <p style={{ fontSize:16, fontWeight:900, color:"#5eead4" }}>সফলভাবে Redeem হয়েছে!</p>
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginTop:6 }}>
                কাস্টমারকে ৳{info?.final_discount} ডিসকাউন্ট দিন
              </p>
            </div>
          )}

          {info && !success && (
            <div style={{ marginBottom:20 }}>
              {/* Status badge */}
              <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
                <div style={{ padding:"6px 20px", borderRadius:20, fontSize:13, fontWeight:800,
                  background: info.is_redeemed ? "rgba(239,68,68,0.2)" : "rgba(20,184,166,0.2)",
                  border: `1px solid ${info.is_redeemed ? "rgba(239,68,68,0.4)" : "rgba(20,184,166,0.4)"}`,
                  color: info.is_redeemed ? "#f87171" : "#5eead4" }}>
                  {info.is_redeemed ? "❌ ইতিমধ্যে ব্যবহৃত" : "✅ Valid কুপন"}
                </div>
              </div>

              {/* Coupon details */}
              <div style={{ background:"rgba(56,189,248,0.06)", borderRadius:16,
                padding:"16px", border:"1px solid rgba(56,189,248,0.15)" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  {[
                    { icon:"🧾", label:"কুপন কোড", val: info.coupon_code },
                    { icon:"💰", label:"ডিসকাউন্ট", val: `৳${info.final_discount}` },
                    { icon:"🏪", label:"রেস্টুরেন্ট", val: info.restaurants?.name || "—" },
                    { icon:"🕐", label:"তৈরি হয়েছে", val: timeAgo(info.created_at) },
                    { icon:"🎡", label:"Spin সংখ্যা", val: `${info.spins_count}টি` },
                    { icon:"📘", label:"Facebook Share", val: info.facebook_shared ? "✓ হ্যাঁ" : "না" },
                  ].map((d, i) => (
                    <div key={i} style={{ background:"rgba(255,255,255,0.04)", borderRadius:10, padding:"10px" }}>
                      <div style={{ fontSize:18, marginBottom:4 }}>{d.icon}</div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", marginBottom:2 }}>{d.label}</div>
                      <div style={{ fontSize:13, fontWeight:800, color: d.label==="ডিসকাউন্ট"?"#7dd3fc":"#fff",
                        wordBreak:"break-all" }}>{d.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {!info.is_redeemed && (
                <button onClick={handleRedeem} disabled={loading}
                  style={{ width:"100%", marginTop:14, padding:"15px", borderRadius:50,
                    border:"none", background:"linear-gradient(135deg,#0ea5e9,#14b8a6)",
                    color:"#fff", fontWeight:900, fontSize:16, cursor:"pointer",
                    fontFamily:"inherit", boxShadow:"0 0 24px rgba(14,165,233,0.5)" }}>
                  {loading ? "⏳ প্রক্রিয়া হচ্ছে..." : "✅ Redeem করুন"}
                </button>
              )}
            </div>
          )}

          <p style={{ textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.2)", marginTop:8 }}>
            Powered by SpinReward 🇧🇩
          </p>
        </div>
      </div>
    </div>
  );
}
