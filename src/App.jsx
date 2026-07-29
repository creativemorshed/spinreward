// src/App.jsx — Main Router
import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import Landing    from "./pages/Landing";
import Auth       from "./pages/Auth";
import Dashboard  from "./pages/Dashboard";
import WheelPage  from "./pages/WheelPage";
import RedeemPage from "./pages/RedeemPage";

export default function App() {
  const [session, setSession] = useState(null);
  const [page, setPage]       = useState("loading");
  const [authMode, setAuthMode] = useState("login");

  const path = window.location.pathname;

  // Route detection
  const getRoute = (p) => {
    if (p.startsWith("/r/"))      return "wheel";
    if (p.startsWith("/redeem"))  return "redeem";
    if (p === "/dashboard")       return "dashboard";
    if (p === "/login")           return "auth-login";
    if (p === "/register")        return "auth-register";
    return "landing";
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      const route = getRoute(path);
      if (route === "wheel" || route === "redeem") {
        setPage(route);
      } else if (session && route === "landing") {
        setPage("dashboard");
      } else {
        setPage(route.startsWith("auth") ? "auth" : route);
        if (route === "auth-login")    setAuthMode("login");
        if (route === "auth-register") setAuthMode("register");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  const navigate = (to) => {
    window.history.pushState({}, "", to);
    const route = getRoute(to);
    if (route === "wheel" || route === "redeem") setPage(route);
    else if (route === "dashboard") setPage("dashboard");
    else if (route === "auth-login")    { setAuthMode("login");    setPage("auth"); }
    else if (route === "auth-register") { setAuthMode("register"); setPage("auth"); }
    else setPage("landing");
  };

  if (page === "loading") return <Loader />;

  const slug   = path.startsWith("/r/") ? path.split("/r/")[1] : null;
  const coupon = new URLSearchParams(window.location.search).get("code");

  if (page === "wheel")     return <WheelPage slug={slug} />;
  if (page === "redeem")    return <RedeemPage coupon={coupon} />;
  if (page === "dashboard") return <Dashboard onLogout={() => navigate("/")} />;
  if (page === "auth")      return <Auth mode={authMode} onSuccess={() => navigate("/dashboard")} />;

  return (
    <Landing
      onRegister={() => navigate("/register")}
      onLogin={() => navigate("/login")}
    />
  );
}

function Loader() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center",
      justifyContent:"center",
      background:"linear-gradient(160deg,#0a1f35,#0d2f4a,#071a2e)",
      fontFamily:"'Baloo Da 2',sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:56, animation:"spin 1s linear infinite" }}>🎡</div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
