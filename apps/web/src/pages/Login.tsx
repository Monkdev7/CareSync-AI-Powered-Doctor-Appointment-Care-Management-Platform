import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Heart } from "lucide-react";

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
        <Heart size={40} style={{ marginBottom: 20, opacity: 0.8 }} />
        <h1>CareSync</h1>
        <p>AI-powered healthcare platform. Manage appointments, connect with doctors, and take control of your health journey.</p>
      </div>
      <div className="auth-right">
        <div className="auth-form">
          <h2>Sign in</h2>
          <p className="sub">Welcome back. Enter your credentials to continue.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-group"><label className="form-label">Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@example.com" required /></div>
            <div className="form-group"><label className="form-label">Password</label><input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Enter password" required /></div>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          </form>
          <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Don't have an account? <Link to="/register" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Register</Link></p>
        </div>
      </div>
    </div>
  );
}
