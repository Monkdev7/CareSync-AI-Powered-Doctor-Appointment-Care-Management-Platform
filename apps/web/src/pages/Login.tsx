import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await login(email, password); nav("/"); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.15)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.75rem", margin: "0 auto 1rem" }}>🏥</div>
        </div>
        <h1>CareSync</h1>
        <p>AI-Powered Healthcare Platform. Book appointments, manage your health, and stay connected with your doctors — all in one place.</p>
      </div>
      <div className="auth-form-section">
        <div className="auth-form">
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in to your CareSync account</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email Address</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" required />
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading} style={{ marginTop: "0.5rem" }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
          <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--gray-500)", textAlign: "center" }}>
            Don't have an account? <Link to="/register" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
