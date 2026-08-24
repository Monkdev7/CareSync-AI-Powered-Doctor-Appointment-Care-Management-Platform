import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pw = form.password;
  const checks = [
    { ok: pw.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Z]/.test(pw), label: "One uppercase letter" },
    { ok: /[a-z]/.test(pw), label: "One lowercase letter" },
    { ok: /[0-9]/.test(pw), label: "One number" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await register(form); nav("/"); } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div style={{ marginBottom: "2rem" }}>
          <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.15)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.75rem", margin: "0 auto 1rem" }}>🏥</div>
        </div>
        <h1>CareSync</h1>
        <p>Join thousands of patients who trust CareSync for managing their healthcare journey.</p>
      </div>
      <div className="auth-form-section">
        <div className="auth-form">
          <h2>Create your account</h2>
          <p className="subtitle">Start managing your health today</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="grid-2">
              <div className="form-group">
                <label>First Name</label>
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="John" required />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Doe" required />
              </div>
            </div>
            <div className="form-group">
              <label>Email Address</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="you@example.com" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="Create a strong password" required />
              {pw.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  {checks.map((c, i) => (
                    <div key={i} style={{ fontSize: "0.75rem", color: c.ok ? "var(--success)" : "var(--gray-400)", display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.125rem" }}>
                      {c.ok ? "✓" : "○"} {c.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>
          <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", color: "var(--gray-500)", textAlign: "center" }}>
            Already have an account? <Link to="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
