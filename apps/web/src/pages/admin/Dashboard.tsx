import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import { Settings, Users, LogOut, UserPlus, CalendarOff } from "lucide-react";

export default function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"overview"|"doctors"|"create"|"leave">("overview");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success"|"error">("success");
  const [docForm, setDocForm] = useState({ email:"",password:"",firstName:"",lastName:"",specialisationId:"",qualifications:"MD",bio:"",consultationDurationMin:30 });
  const [leaveForm, setLeaveForm] = useState({ doctorId:"",startDate:"",endDate:"",reason:"" });

  useEffect(()=>{ loadDoctors();loadSpecs(); },[]);
  const loadDoctors=async()=>{ const r=await api.get("/api/doctors",token);if(r.data)setDoctors(r.data); };
  const loadSpecs=async()=>{ const r=await api.get("/api/specialisations",token);if(r.data)setSpecs(r.data); };
  const createDoctor=async(e:React.FormEvent)=>{ e.preventDefault();setMsg(""); const r=await api.post("/api/doctors",{...docForm,qualifications:docForm.qualifications.split(",").map(s=>s.trim()),consultationDurationMin:Number(docForm.consultationDurationMin)},token); if(r.data){setMsg("Doctor created.");setMsgType("success");loadDoctors();setView("doctors");}else{setMsg(r.error?.details?.map((d:any)=>d.message).join(". ")||r.error?.message||"Failed");setMsgType("error");}};
  const createLeave=async(e:React.FormEvent)=>{ e.preventDefault();setMsg(""); const r=await api.post(`/api/doctors/${leaveForm.doctorId}/leave`,{startDate:leaveForm.startDate,endDate:leaveForm.endDate,reason:leaveForm.reason},token); if(r.data){setMsg("Leave created. Affected appointments cancelled.");setMsgType("success");}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const initials=user?`${user.firstName[0]}${user.lastName[0]}`:"";

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand"><Settings size={18}/><span>CareSync Admin</span></div>
        <div className="nav-links">
          <button className={view==="overview"?"active":""} onClick={()=>setView("overview")}>Overview</button>
          <button className={view==="doctors"?"active":""} onClick={()=>setView("doctors")}>Doctors</button>
          <button className={view==="create"?"active":""} onClick={()=>setView("create")}>Add Doctor</button>
          <button className={view==="leave"?"active":""} onClick={()=>setView("leave")}>Leave</button>
        </div>
        <div className="nav-right"><div className="nav-avatar">{initials}</div><span className="nav-user">{user?.firstName}</span><button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14}/></button></div>
      </nav>
      <div className="main">
        {msg&&<div className={`alert alert-${msgType}`}>{msg}</div>}
        {view==="overview"&&(<><h1 className="page-title">Admin Overview</h1><p className="page-desc">System management and monitoring.</p><div className="stat-grid"><div className="stat-card"><div className="stat-icon i-blue"><Users size={18}/></div><div><div className="stat-val">{doctors.length}</div><div className="stat-label">Doctors</div></div></div><div className="stat-card"><div className="stat-icon i-green"><Settings size={18}/></div><div><div className="stat-val">{specs.length}</div><div className="stat-label">Specialisations</div></div></div></div></>)}
        {view==="doctors"&&(<><h1 className="page-title">Doctors</h1><p className="page-desc">All registered doctors on the platform.</p><div className="doc-grid">{doctors.map(d=>(<div key={d.id} className="doc-card"><div className="doc-card-top"><div className="doc-avatar">{d.user.firstName[0]}{d.user.lastName[0]}</div><div><div className="doc-name">Dr. {d.user.firstName} {d.user.lastName}</div><div className="doc-spec">{d.specialisation?.name}</div></div></div><div className="doc-meta"><span>{d.consultationDurationMin} min</span><span>{d.qualifications?.join(", ")}</span></div><span className={`badge ${d.user.isActive?"badge-confirmed":"badge-cancelled"}`}>{d.user.isActive?"Active":"Inactive"}</span></div>))}</div></>)}
        {view==="create"&&(<div className="card" style={{maxWidth:520}}><div className="flex gap-sm mb-sm" style={{alignItems:"center",marginBottom:16}}><UserPlus size={18} color="var(--accent)"/><span className="card-title">Register Doctor</span></div><form onSubmit={createDoctor}><div className="form-row"><div className="form-group"><label className="form-label">First name</label><input value={docForm.firstName} onChange={e=>setDocForm({...docForm,firstName:e.target.value})} required/></div><div className="form-group"><label className="form-label">Last name</label><input value={docForm.lastName} onChange={e=>setDocForm({...docForm,lastName:e.target.value})} required/></div></div><div className="form-group"><label className="form-label">Email</label><input value={docForm.email} onChange={e=>setDocForm({...docForm,email:e.target.value})} type="email" required/></div><div className="form-group"><label className="form-label">Password</label><input value={docForm.password} onChange={e=>setDocForm({...docForm,password:e.target.value})} type="password" required/></div><div className="form-group"><label className="form-label">Specialisation</label><select value={docForm.specialisationId} onChange={e=>setDocForm({...docForm,specialisationId:e.target.value})} required><option value="">Select...</option>{specs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="form-row"><div className="form-group"><label className="form-label">Qualifications</label><input value={docForm.qualifications} onChange={e=>setDocForm({...docForm,qualifications:e.target.value})}/></div><div className="form-group"><label className="form-label">Duration (min)</label><input type="number" value={docForm.consultationDurationMin} onChange={e=>setDocForm({...docForm,consultationDurationMin:Number(e.target.value)})}/></div></div><button className="btn btn-primary">Create doctor</button></form></div>)}
        {view==="leave"&&(<div className="card" style={{maxWidth:520}}><div className="flex gap-sm mb-sm" style={{alignItems:"center",marginBottom:16}}><CalendarOff size={18} color="var(--accent)"/><span className="card-title">Doctor Leave</span></div><form onSubmit={createLeave}><div className="form-group"><label className="form-label">Doctor</label><select value={leaveForm.doctorId} onChange={e=>setLeaveForm({...leaveForm,doctorId:e.target.value})} required><option value="">Select...</option>{doctors.map(d=><option key={d.id} value={d.id}>Dr. {d.user.firstName} {d.user.lastName}</option>)}</select></div><div className="form-row"><div className="form-group"><label className="form-label">Start</label><input type="date" value={leaveForm.startDate} onChange={e=>setLeaveForm({...leaveForm,startDate:e.target.value})} required/></div><div className="form-group"><label className="form-label">End</label><input type="date" value={leaveForm.endDate} onChange={e=>setLeaveForm({...leaveForm,endDate:e.target.value})} required/></div></div><div className="form-group"><label className="form-label">Reason</label><input value={leaveForm.reason} onChange={e=>setLeaveForm({...leaveForm,reason:e.target.value})} placeholder="Optional"/></div><button className="btn btn-primary">Create leave</button></form></div>)}
      </div>
    </div>
  );
}
