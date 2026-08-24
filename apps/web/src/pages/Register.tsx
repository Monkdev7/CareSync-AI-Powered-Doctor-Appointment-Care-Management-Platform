import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Heart, Check, Circle } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pw = form.password;
  const checks = [
    { ok: pw.length >= 8, label: "8+ characters" },
    { ok: /[A-Z]/.test(pw), label: "Uppercase letter" },
    { ok: /[a-z]/.test(pw), label: "Lowercase letter" },
    { ok: /[0-9]/.test(pw), label: "Number" },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await register(form); nav("/"); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <Heart size={40} style={{ marginBottom: 20, opacity: 0.8 }} />
        <h1>CareSync</h1>
        <p>Join our healthcare platform. Book appointments, receive AI-powered health insights, and manage your medical records securely.</p>
      </div>
      <div className="auth-right">
        <div className="auth-form">
          <h2>Create account</h2>
          <p className="sub">Get started with your healthcare journey.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-row">
              <div className="form-group"><label className="form-label">First name</label><input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} placeholder="John" required /></div>
              <div className="form-group"><label className="form-label">Last name</label><input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} placeholder="Doe" required /></div>
            </div>
            <div className="form-group"><label className="form-label">Email</label><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} type="email" placeholder="you@example.com" required /></div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input value={form.password} onChange={e => setForm({...form, password: e.target.value})} type="password" placeholder="Create password" required />
              {pw && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>{checks.map((c,i) => <span key={i} style={{ fontSize: 11, color: c.ok ? "var(--success)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>{c.ok ? <Check size={11}/> : <Circle size={9}/>} {c.label}</span>)}</div>}
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>{loading ? "Creating..." : "Create account"}</button>
          </form>
          <p style={{ marginTop: 20, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Have an account? <Link to="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
