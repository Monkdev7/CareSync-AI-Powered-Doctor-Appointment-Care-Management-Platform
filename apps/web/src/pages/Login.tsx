import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Activity, Shield, Calendar, Brain } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await login(email, password); nav("/"); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <Activity size={28} style={{opacity:.6,marginBottom:16}}/>
        <h1>CareSync</h1>
        <p>AI-powered healthcare appointment and follow-up management platform.</p>
        <ul className="features">
          <li><Shield size={14}/>Secure appointment booking</li>
          <li><Brain size={14}/>AI-assisted visit summaries</li>
          <li><Calendar size={14}/>Medication reminders & scheduling</li>
        </ul>
      </div>
      <div className="auth-right">
        <div className="auth-form">
          <h2>Sign in</h2>
          <p className="sub">Enter your credentials to access your account.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group"><label className="form-label">Email</label><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com" required/></div>
            <div className="form-group"><label className="form-label">Password</label><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="Enter password" required/></div>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>{loading?"Signing in...":"Sign in"}</button>
          </form>
          <p style={{marginTop:20,fontSize:12,color:"var(--text-3)",textAlign:"center"}}>No account? <Link to="/register" style={{color:"var(--accent)",fontWeight:600,textDecoration:"none"}}>Register as patient</Link></p>
        </div>
      </div>
    </div>
  );
}
