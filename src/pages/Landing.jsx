// src/pages/Landing.jsx
export default function Landing({ onRegister, onLogin }) {
  const plans = [
    { name:"Basic",    price:499,  color:"#0ea5e9", features:["Spin Wheel","QR Code","৩টি Reward Slot","Basic Analytics","১৪ দিন Trial"] },
    { name:"Standard", price:999,  color:"#a855f7", badge:"🔥 জনপ্রিয়", features:["সব Basic সুবিধা","১০টি Reward Slot","Facebook Share Card","Advanced Analytics","Coupon Redemption"] },
    { name:"Premium",  price:1999, color:"#14b8a6", features:["সব Standard সুবিধা","Unlimited Rewards","Custom Domain","Priority Support","White Label"] },
  ];

  return (
    <div style={{ fontFamily:"'Baloo Da 2','Noto Sans Bengali',sans-serif",
      background:"linear-gradient(160deg,#0a1f35,#0d2f4a,#071a2e)", minHeight:"100vh", color:"#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+Da+2:wght@400;700;800;900&family=Noto+Sans+Bengali:wght@400;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* Navbar */}
      <nav style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"16px 24px", borderBottom:"1px solid rgba(56,189,248,0.15)",
        backdropFilter:"blur(10px)", position:"sticky", top:0, zIndex:100,
        background:"rgba(10,31,53,0.8)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:28 }}>🎡</span>
          <span style={{ fontSize:20, fontWeight:900, color:"#38bdf8" }}>SpinReward</span>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onLogin}
            style={{ padding:"9px 20px", borderRadius:10,
              border:"1.5px solid rgba(56,189,248,0.4)",
              background:"transparent", color:"#38bdf8",
              fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
            লগইন
          </button>
          <button onClick={onRegister}
            style={{ padding:"9px 20px", borderRadius:10, border:"none",
              background:"linear-gradient(135deg,#0ea5e9,#14b8a6)", color:"#fff",
              fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit",
              boxShadow:"0 0 20px rgba(14,165,233,0.4)" }}>
            শুরু করুন →
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ textAlign:"center", padding:"64px 24px 48px", animation:"fadeUp 0.6s ease" }}>
        <div style={{ fontSize:72, marginBottom:20, animation:"float 3s ease-in-out infinite" }}>🎡</div>
        <h1 style={{ fontSize:38, fontWeight:900, lineHeight:1.2, marginBottom:16,
          background:"linear-gradient(135deg,#38bdf8,#14b8a6)", WebkitBackgroundClip:"text",
          WebkitTextFillColor:"transparent" }}>
          রেস্টুরেন্টে Lucky Spin<br/>যোগ করুন
        </h1>
        <p style={{ fontSize:16, color:"rgba(255,255,255,0.6)", maxWidth:440, margin:"0 auto 32px", lineHeight:1.7 }}>
          QR স্ক্যান করুন → Spin করুন → ডিসকাউন্ট জিতুন → Facebook-এ শেয়ার করুন।
          কাস্টমার engagement বাড়ান, marketing cost কমান।
        </p>
        <button onClick={onRegister}
          style={{ padding:"18px 40px", borderRadius:50, border:"none",
            background:"linear-gradient(135deg,#0ea5e9,#06b6d4,#14b8a6)", color:"#fff",
            fontWeight:900, fontSize:18, cursor:"pointer", fontFamily:"inherit",
            boxShadow:"0 0 40px rgba(14,165,233,0.5)", letterSpacing:1 }}>
          ১৪ দিন ফ্রি শুরু করুন 🚀
        </button>
        <p style={{ fontSize:12, color:"rgba(255,255,255,0.3)", marginTop:10 }}>কোনো credit card লাগবে না</p>
      </div>

      {/* Flow */}
      <div style={{ padding:"0 24px 48px", maxWidth:800, margin:"0 auto" }}>
        <h2 style={{ textAlign:"center", fontSize:22, fontWeight:900,
          marginBottom:28, color:"#7dd3fc" }}>কীভাবে কাজ করে?</h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:16 }}>
          {[
            { icon:"📱", step:"১", label:"QR Scan করুন" },
            { icon:"🎡", step:"২", label:"Spin করুন" },
            { icon:"🎁", step:"৩", label:"Reward জিতুন" },
            { icon:"📲", step:"৪", label:"Facebook Share" },
            { icon:"🧾", step:"৫", label:"Coupon Redeem" },
          ].map((s, i) => (
            <div key={i} style={{ background:"rgba(13,47,74,0.7)", borderRadius:16,
              padding:"20px 12px", textAlign:"center",
              border:"1px solid rgba(56,189,248,0.15)" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>{s.icon}</div>
              <div style={{ fontSize:11, color:"#38bdf8", fontWeight:800, marginBottom:4 }}>ধাপ {s.step}</div>
              <div style={{ fontSize:13, fontWeight:700 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div style={{ padding:"0 24px 48px", maxWidth:800, margin:"0 auto" }}>
        <h2 style={{ textAlign:"center", fontSize:22, fontWeight:900,
          marginBottom:28, color:"#7dd3fc" }}>মূল সুবিধা</h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:16 }}>
          {[
            { icon:"🎯", t:"Prize Cap Control",   d:"ডিসকাউন্ট সীমা আপনি ঠিক করুন" },
            { icon:"📊", t:"Real-time Analytics",  d:"Spins, Shares, Redemptions দেখুন" },
            { icon:"📲", t:"Facebook Share Card",  d:"কাস্টমার নিজেই marketing করবে" },
            { icon:"🔗", t:"QR Code System",       d:"টেবিলে রাখুন, scan করলেই চালু" },
            { icon:"🧾", t:"Coupon Redemption",    d:"Cashier-এ verify করুন সহজে" },
            { icon:"🎨", t:"Custom Branding",      d:"আপনার রঙ, লোগো, নাম দিন" },
          ].map((f, i) => (
            <div key={i} style={{ background:"rgba(13,47,74,0.7)", borderRadius:16,
              padding:"20px", border:"1px solid rgba(56,189,248,0.15)" }}>
              <div style={{ fontSize:32, marginBottom:10 }}>{f.icon}</div>
              <div style={{ fontWeight:800, fontSize:14, marginBottom:6, color:"#e0f2fe" }}>{f.t}</div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)" }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div style={{ padding:"0 24px 64px", maxWidth:900, margin:"0 auto" }}>
        <h2 style={{ textAlign:"center", fontSize:22, fontWeight:900,
          marginBottom:32, color:"#7dd3fc" }}>💰 মূল্য তালিকা</h2>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:20 }}>
          {plans.map((plan, i) => (
            <div key={i} style={{ borderRadius:20, padding:"28px 22px",
              background:"rgba(13,47,74,0.8)",
              border:`1.5px solid ${plan.color}60`,
              position:"relative",
              boxShadow:`0 0 30px ${plan.color}20` }}>
              {plan.badge && (
                <div style={{ position:"absolute", top:-14, left:"50%",
                  transform:"translateX(-50%)",
                  background:plan.color, color:"#fff", fontSize:12,
                  fontWeight:800, padding:"4px 16px", borderRadius:20 }}>
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize:20, fontWeight:900, color:plan.color, marginBottom:6 }}>{plan.name}</div>
              <div style={{ fontSize:36, fontWeight:900, marginBottom:4 }}>
                ৳{plan.price.toLocaleString()}
                <span style={{ fontSize:14, color:"rgba(255,255,255,0.4)", fontWeight:600 }}>/মাস</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, margin:"18px 0 22px" }}>
                {plan.features.map((f, j) => (
                  <div key={j} style={{ fontSize:13, color:"rgba(255,255,255,0.7)",
                    display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ color:plan.color }}>✓</span> {f}
                  </div>
                ))}
              </div>
              <button onClick={onRegister}
                style={{ width:"100%", padding:"13px", borderRadius:50, border:"none",
                  background:`linear-gradient(135deg,${plan.color},${plan.color}99)`,
                  color:"#fff", fontWeight:800, fontSize:15, cursor:"pointer",
                  fontFamily:"inherit", boxShadow:`0 0 20px ${plan.color}40` }}>
                ফ্রি শুরু করুন →
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign:"center", padding:"24px", color:"rgba(255,255,255,0.2)", fontSize:12,
        borderTop:"1px solid rgba(56,189,248,0.1)" }}>
        © 2025 SpinReward · Made with ❤️ in Bangladesh
      </div>
    </div>
  );
}
