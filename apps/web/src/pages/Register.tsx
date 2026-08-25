import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { Activity, Check, Circle } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({email:"",password:"",firstName:"",lastName:""});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pw=form.password;
  const checks=[{ok:pw.length>=8,l:"8+ characters"},{ok:/[A-Z]/.test(pw),l:"Uppercase"},{ok:/[a-z]/.test(pw),l:"Lowercase"},{ok:/[0-9]/.test(pw),l:"Number"}];

  const submit=async(e:React.FormEvent)=>{e.preventDefault();setError("");setLoading(true);try{await register(form);nav("/");}catch(err:any){setError(err.message);}finally{setLoading(false);}};

  return (
    <div className="auth-wrap">
      <div className="auth-left"><Activity size={28} style={{opacity:.6,marginBottom:16}}/><h1>CareSync</h1><p>Join our healthcare platform to manage appointments and receive AI-powered health insights.</p></div>
      <div className="auth-right">
        <div className="auth-form">
          <h2>Create account</h2>
          <p className="sub">Register as a patient to get started.</p>
          {error&&<div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <div className="form-row"><div className="form-group"><label className="form-label">First name</label><input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} required/></div><div className="form-group"><label className="form-label">Last name</label><input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} required/></div></div>
            <div className="form-group"><label className="form-label">Email</label><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} type="email" placeholder="you@example.com" required/></div>
            <div className="form-group"><label className="form-label">Password</label><input value={form.password} onChange={e=>setForm({...form,password:e.target.value})} type="password" placeholder="Create password" required/>{pw&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:"4px 12px"}}>{checks.map((c,i)=><span key={i} style={{fontSize:10,color:c.ok?"var(--success)":"var(--text-3)",display:"flex",alignItems:"center",gap:2}}>{c.ok?<Check size={10}/>:<Circle size={8}/>}{c.l}</span>)}</div>}</div>
            <button className="btn btn-primary btn-block btn-lg" disabled={loading}>{loading?"Creating...":"Create account"}</button>
          </form>
          <p style={{marginTop:20,fontSize:12,color:"var(--text-3)",textAlign:"center"}}>Have an account? <Link to="/login" style={{color:"var(--accent)",fontWeight:600,textDecoration:"none"}}>Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
