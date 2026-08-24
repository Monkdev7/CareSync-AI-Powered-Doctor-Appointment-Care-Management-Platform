import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await register(form); nav("/"); } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="container" style={{ maxWidth: 400, marginTop: "4rem" }}>
      <div className="card">
        <h2>Register</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>First Name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <label>Last Name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" required />
          <label>Password</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" required />
          <button className="btn btn-primary" style={{ width: "100%" }}>Register</button>
        </form>
        <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>Have an account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
}
