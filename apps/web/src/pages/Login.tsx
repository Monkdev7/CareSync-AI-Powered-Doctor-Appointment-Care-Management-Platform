import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError("");
    try { await login(email, password); nav("/"); } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="container" style={{ maxWidth: 400, marginTop: "4rem" }}>
      <div className="card">
        <h2>Login</h2>
        {error && <p className="error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          <label>Password</label><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          <button className="btn btn-primary" style={{ width: "100%" }}>Login</button>
        </form>
        <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>No account? <Link to="/register">Register as patient</Link></p>
      </div>
    </div>
  );
}
