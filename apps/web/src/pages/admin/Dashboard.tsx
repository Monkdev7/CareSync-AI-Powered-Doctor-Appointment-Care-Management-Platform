import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import { LayoutDashboard, Users, UserPlus, CalendarOff, Settings, LogOut, Activity } from "lucide-react";

export default function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"overview"|"doctors"|"create"|"leave">("overview");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success"|"error">("success");
  const [docForm, setDocForm] = useState({email:"",password:"",firstName:"",lastName:"",specialisationId:"",qualifications:"MD",bio:"",consultationDurationMin:30});
  const [leaveForm, setLeaveForm] = useState({doctorId:"",startDate:"",endDate:"",reason:""});

  useEffect(()=>{ loadDoctors();loadSpecs(); },[]);
  const loadDoctors=async()=>{ const r=await api.get("/api/doctors",token);if(r.data)setDoctors(r.data); };
  const loadSpecs=async()=>{ const r=await api.get("/api/specialisations",token);if(r.data)setSpecs(r.data); };
  const createDoctor=async(e:React.FormEvent)=>{ e.preventDefault();setMsg(""); const r=await api.post("/api/doctors",{...docForm,qualifications:docForm.qualifications.split(",").map(s=>s.trim()),consultationDurationMin:Number(docForm.consultationDurationMin)},token); if(r.data){setMsg("Doctor registered.");setMsgType("success");loadDoctors();setView("doctors");}else{setMsg(r.error?.details?.map((d:any)=>d.message).join(". ")||r.error?.message||"Failed");setMsgType("error");}};
  const createLeave=async(e:React.FormEvent)=>{ e.preventDefault();setMsg(""); const r=await api.post(`/api/doctors/${leaveForm.doctorId}/leave`,{startDate:leaveForm.startDate,endDate:leaveForm.endDate,reason:leaveForm.reason},token); if(r.data){setMsg("Leave created. Affected appointments cancelled.");setMsgType("success");}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const initials=user?`${user.firstName[0]}${user.lastName[0]}`:"";

  const nav=[
    {id:"overview",icon:LayoutDashboard,label:"Overview"},
    {id:"doctors",icon:Users,label:"Doctors"},
    {id:"create",icon:UserPlus,label:"Add Doctor"},
    {id:"leave",icon:CalendarOff,label:"Leave Management"},
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Settings size={18}/>CareSync Admin</div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Management</div>
            {nav.map(n=><button key={n.id} className={`sidebar-link ${view===n.id?"active":""}`} onClick={()=>setView(n.id as any)}><n.icon size={16}/>{n.label}</button>)}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><div className="av">{initials}</div><div className="info"><div className="name">{user?.firstName}</div><div className="role">Administrator</div></div></div>
          <button className="sidebar-link" onClick={logout} style={{marginTop:8}}><LogOut size={14}/>Sign out</button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar"><span className="topbar-title">{nav.find(n=>n.id===view)?.label||"Admin"}</span></header>
        <div className="content">
          {msg&&<div className={`alert alert-${msgType} mb-md`}>{msg}</div>}

          {view==="overview"&&(<>
            <div className="stats" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
              <div className="stat"><div className="stat-label">Doctors</div><div className="stat-value">{doctors.length}</div></div>
              <div className="stat"><div className="stat-label">Specialisations</div><div className="stat-value">{specs.length}</div></div>
              <div className="stat"><div className="stat-label">System</div><div className="stat-value" style={{fontSize:14,color:"var(--success)"}}>Operational</div></div>
            </div>
            <div className="card"><div className="card-title">Registered Doctors</div>
              <div className="table-wrap"><table><thead><tr><th>Doctor</th><th>Specialisation</th><th>Duration</th><th>Status</th></tr></thead><tbody>{doctors.map(d=><tr key={d.id}><td style={{fontWeight:500}}>Dr. {d.user.firstName} {d.user.lastName}</td><td>{d.specialisation?.name}</td><td>{d.consultationDurationMin} min</td><td><span className={`badge ${d.user.isActive?"badge-confirmed":"badge-cancelled"}`}>{d.user.isActive?"Active":"Inactive"}</span></td></tr>)}</tbody></table></div>
            </div>
          </>)}

          {view==="doctors"&&(<>
            <div className="card"><div className="card-title">All Doctors</div>
              <div className="table-wrap"><table><thead><tr><th>Doctor</th><th>Email</th><th>Specialisation</th><th>Qualifications</th><th>Duration</th><th>Status</th></tr></thead><tbody>{doctors.map(d=><tr key={d.id}><td style={{fontWeight:500}}>Dr. {d.user.firstName} {d.user.lastName}</td><td style={{color:"var(--text-3)"}}>{d.user.email}</td><td>{d.specialisation?.name}</td><td style={{fontSize:11}}>{d.qualifications?.join(", ")}</td><td>{d.consultationDurationMin} min</td><td><span className={`badge ${d.user.isActive?"badge-confirmed":"badge-cancelled"}`}>{d.user.isActive?"Active":"Inactive"}</span></td></tr>)}</tbody></table></div>
            </div>
          </>)}

          {view==="create"&&(<div className="card" style={{maxWidth:560}}>
            <div className="card-title">Register New Doctor</div>
            <div className="card-subtitle">Create a doctor account with profile and credentials.</div>
            <form onSubmit={createDoctor}>
              <div className="form-row"><div className="form-group"><label className="form-label">First name</label><input value={docForm.firstName} onChange={e=>setDocForm({...docForm,firstName:e.target.value})} required/></div><div className="form-group"><label className="form-label">Last name</label><input value={docForm.lastName} onChange={e=>setDocForm({...docForm,lastName:e.target.value})} required/></div></div>
              <div className="form-group"><label className="form-label">Email</label><input value={docForm.email} onChange={e=>setDocForm({...docForm,email:e.target.value})} type="email" required/></div>
              <div className="form-group"><label className="form-label">Password</label><input value={docForm.password} onChange={e=>setDocForm({...docForm,password:e.target.value})} type="password" required/></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Specialisation</label><select value={docForm.specialisationId} onChange={e=>setDocForm({...docForm,specialisationId:e.target.value})} required><option value="">Select...</option>{specs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div className="form-group"><label className="form-label">Duration (min)</label><input type="number" value={docForm.consultationDurationMin} onChange={e=>setDocForm({...docForm,consultationDurationMin:Number(e.target.value)})}/></div></div>
              <div className="form-group"><label className="form-label">Qualifications (comma-separated)</label><input value={docForm.qualifications} onChange={e=>setDocForm({...docForm,qualifications:e.target.value})}/></div>
              <button className="btn btn-primary">Create Doctor</button>
            </form>
          </div>)}

          {view==="leave"&&(<div className="card" style={{maxWidth:560}}>
            <div className="card-title">Doctor Leave</div>
            <div className="card-subtitle">Mark a doctor unavailable. Affected appointments will be cancelled and patients notified.</div>
            <form onSubmit={createLeave}>
              <div className="form-group"><label className="form-label">Doctor</label><select value={leaveForm.doctorId} onChange={e=>setLeaveForm({...leaveForm,doctorId:e.target.value})} required><option value="">Select doctor...</option>{doctors.map(d=><option key={d.id} value={d.id}>Dr. {d.user.firstName} {d.user.lastName}</option>)}</select></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Start date</label><input type="date" value={leaveForm.startDate} onChange={e=>setLeaveForm({...leaveForm,startDate:e.target.value})} required/></div><div className="form-group"><label className="form-label">End date</label><input type="date" value={leaveForm.endDate} onChange={e=>setLeaveForm({...leaveForm,endDate:e.target.value})} required/></div></div>
              <div className="form-group"><label className="form-label">Reason (optional)</label><input value={leaveForm.reason} onChange={e=>setLeaveForm({...leaveForm,reason:e.target.value})} placeholder="Personal, conference, etc."/></div>
              <button className="btn btn-primary">Create Leave</button>
            </form>
          </div>)}
        </div>
      </div>
    </div>
  );
}
