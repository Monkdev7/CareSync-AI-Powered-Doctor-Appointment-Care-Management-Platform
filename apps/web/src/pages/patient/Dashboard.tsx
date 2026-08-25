import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import { LayoutDashboard, Search, Calendar, Pill, Bell, User, LogOut, Clock, ClipboardList, ArrowLeft, Stethoscope, Activity } from "lucide-react";

export default function PatientDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"overview"|"doctors"|"appointments"|"book"|"medications"|"notifications">("overview");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [date, setDate] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; });
  const [holdId, setHoldId] = useState<string|null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success"|"error">("success");
  const [apptDetail, setApptDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ loadDoctors(); loadAppointments(); loadNotifications(); },[]);
  const loadDoctors=async()=>{ setLoading(true); const r=await api.get("/api/doctors",token); if(r.data) setDoctors(r.data); setLoading(false); };
  const loadAppointments=async()=>{ const r=await api.get("/api/appointments",token); if(r.data) setAppointments(r.data); };
  const loadNotifications=async()=>{ const r=await api.get("/api/notifications",token); if(r.data) setNotifications(r.data); };
  const loadSlots=async(id:string,d:string)=>{ const r=await api.get(`/api/doctors/${id}/availability?date=${d}`,token); if(r.data) setSlots(r.data.slots||[]); else setSlots([]); };
  const selectDoc=(d:any)=>{ setSelectedDoctor(d); setView("book"); setHoldId(null); setSymptoms(""); setMsg(""); loadSlots(d.id,date); };
  const holdSlot=async(s:any)=>{ setMsg(""); const r=await api.post("/api/appointments/hold",{doctorProfileId:selectedDoctor.id,slotDate:date,slotStartTime:s.startTime,slotEndTime:s.endTime},token); if(r.data){setHoldId(r.data.id);setMsg("Slot reserved. Complete booking within 5 minutes.");setMsgType("success");}else{setMsg(r.error?.message||"Unavailable");setMsgType("error");}};
  const confirm=async()=>{ if(!holdId||!symptoms)return; const r=await api.post("/api/appointments/confirm",{holdId,symptoms},token); if(r.data){setMsg("Appointment confirmed.");setMsgType("success");setHoldId(null);setSymptoms("");loadAppointments();setTimeout(()=>{setView("appointments");setApptDetail(null);},1000);}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const viewDetail=async(id:string)=>{ const r=await api.get(`/api/appointments/${id}`,token); if(r.data){const ps=await api.get(`/api/appointments/${id}/post-summary`,token);setApptDetail({...r.data,postSummary:ps.data});setView("appointments");}};

  const upcoming=appointments.filter(a=>a.status==="CONFIRMED");
  const completed=appointments.filter(a=>a.status==="COMPLETED");
  const initials=user?`${user.firstName[0]}${user.lastName[0]}`:"";

  const nav=[
    {id:"overview",icon:LayoutDashboard,label:"Overview"},
    {id:"doctors",icon:Search,label:"Find Doctors"},
    {id:"appointments",icon:Calendar,label:"Appointments"},
    {id:"medications",icon:Pill,label:"Medications"},
    {id:"notifications",icon:Bell,label:"Notifications"},
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Activity size={18}/>CareSync</div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Menu</div>
            {nav.map(n=><button key={n.id} className={`sidebar-link ${view===n.id?"active":""}`} onClick={()=>{setView(n.id as any);setApptDetail(null);}}><n.icon size={16}/>{n.label}</button>)}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="av">{initials}</div>
            <div className="info"><div className="name">{user?.firstName} {user?.lastName}</div><div className="role">Patient</div></div>
          </div>
          <button className="sidebar-link" onClick={logout} style={{marginTop:8}}><LogOut size={14}/>Sign out</button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{nav.find(n=>n.id===view)?.label||(view==="book"?"Book Appointment":"Details")}</span>
          <div className="topbar-right">
            <button className="btn btn-ghost btn-sm" onClick={()=>setView("notifications")}><Bell size={14}/></button>
            <div className="doc-av" style={{width:28,height:28,fontSize:10}}>{initials}</div>
          </div>
        </header>

        <div className="content">
          {/* OVERVIEW */}
          {view==="overview"&&(<>
            <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>Good morning, {user?.firstName}</p>
            <p className="text-muted mb-lg" style={{fontSize:12}}>Here's your healthcare overview.</p>
            <div className="stats">
              <div className="stat"><div className="stat-label">Upcoming</div><div className="stat-value">{upcoming.length}</div></div>
              <div className="stat"><div className="stat-label">Completed</div><div className="stat-value">{completed.length}</div></div>
              <div className="stat"><div className="stat-label">Doctors</div><div className="stat-value">{doctors.length}</div></div>
              <div className="stat"><div className="stat-label">Total visits</div><div className="stat-value">{appointments.length}</div></div>
            </div>
            <div className="grid-2">
              <div>
                <div className="card mb-md">
                  <div className="card-title">Upcoming Appointments</div>
                  {upcoming.length===0?<div className="empty"><Calendar size={24}/><h3>No upcoming appointments</h3><p>Book a consultation to get started.</p><button className="btn btn-accent btn-sm" onClick={()=>setView("doctors")}>Find a doctor</button></div>:
                  upcoming.slice(0,4).map(a=>{const d=new Date(a.slotDate);return <div key={a.id} className="appt-row" onClick={()=>viewDetail(a.id)}><div className="appt-date"><div className="d">{d.getUTCDate()}</div><div className="m">{d.toLocaleString("en",{month:"short",timeZone:"UTC"})}</div></div><div className="appt-info"><h4>Dr. {a.doctorProfile?.user?.firstName} {a.doctorProfile?.user?.lastName}</h4><p>{a.doctorProfile?.specialisation?.name} · {a.slotStartTime}</p></div><span className="badge badge-confirmed">Confirmed</span></div>;})}
                </div>
              </div>
              <div>
                <div className="card mb-md">
                  <div className="card-title">Quick Actions</div>
                  <div className="quick-actions">
                    <div className="quick-action" onClick={()=>setView("doctors")}><Search size={14}/>Find Doctor</div>
                    <div className="quick-action" onClick={()=>setView("appointments")}><Calendar size={14}/>Appointments</div>
                    <div className="quick-action" onClick={()=>setView("medications")}><Pill size={14}/>Medications</div>
                    <div className="quick-action" onClick={()=>setView("notifications")}><Bell size={14}/>Notifications</div>
                  </div>
                </div>
                {doctors.length>0&&<div className="card"><div className="card-title">Available Doctors</div>{doctors.slice(0,3).map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)"}}><div className="doc-av" style={{width:28,height:28,fontSize:9}}>{d.user.firstName[0]}{d.user.lastName[0]}</div><div style={{flex:1}}><div style={{fontSize:12,fontWeight:500}}>Dr. {d.user.lastName}</div><div style={{fontSize:10,color:"var(--text-3)"}}>{d.specialisation?.name}</div></div><button className="btn btn-outline btn-sm" onClick={()=>selectDoc(d)}>Book</button></div>)}</div>}
              </div>
            </div>
          </>)}

          {/* FIND DOCTORS */}
          {view==="doctors"&&(<>
            <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>Find the right doctor</p>
            <p className="text-muted mb-lg" style={{fontSize:12}}>Browse healthcare professionals by specialisation.</p>
            {loading?<div className="doc-grid">{[1,2,3].map(i=><div key={i} className="doc-card"><div style={{display:"flex",gap:10}}><div className="skel" style={{width:38,height:38,borderRadius:"50%"}}/><div><div className="skel" style={{width:100,height:12,marginBottom:6}}/><div className="skel" style={{width:60,height:10}}/></div></div></div>)}</div>:
            doctors.length===0?<div className="empty"><Stethoscope size={24}/><h3>No doctors available</h3><p>Please check back later.</p></div>:
            <div className="doc-grid">{doctors.map(d=><div key={d.id} className="doc-card"><div className="doc-card-top"><div className="doc-av">{d.user.firstName[0]}{d.user.lastName[0]}</div><div><h4>Dr. {d.user.firstName} {d.user.lastName}</h4><p>{d.specialisation?.name}</p></div></div><div className="doc-meta"><span><Clock size={12}/>{d.consultationDurationMin} min</span><span><ClipboardList size={12}/>{d.qualifications?.slice(0,2).join(", ")}</span></div><div className="flex gap-sm"><button className="btn btn-accent btn-sm" onClick={()=>selectDoc(d)}>Book</button><button className="btn btn-outline btn-sm" onClick={()=>selectDoc(d)}>Profile</button></div></div>)}</div>}
          </>)}

          {/* BOOK */}
          {view==="book"&&selectedDoctor&&(<>
            <button className="btn btn-ghost btn-sm mb-md" onClick={()=>setView("doctors")}><ArrowLeft size={12}/>Back to doctors</button>
            <div className="grid-2" style={{gridTemplateColumns:"1fr 1fr"}}>
              <div>
                <div className="card mb-md">
                  <div className="doc-card-top"><div className="doc-av">{selectedDoctor.user.firstName[0]}{selectedDoctor.user.lastName[0]}</div><div><h4>Dr. {selectedDoctor.user.firstName} {selectedDoctor.user.lastName}</h4><p>{selectedDoctor.specialisation?.name} · {selectedDoctor.consultationDurationMin} min</p></div></div>
                  {selectedDoctor.bio&&<p style={{fontSize:11,color:"var(--text-3)",marginTop:8}}>{selectedDoctor.bio}</p>}
                  {selectedDoctor.qualifications&&<div className="doc-meta mt-sm">{selectedDoctor.qualifications.map((q:string,i:number)=><span key={i}>{q}</span>)}</div>}
                </div>
                {holdId&&<div className="card">
                  <div className="card-title">Describe your symptoms</div>
                  <div className="form-group"><label className="form-label">What brings you in today?</label><textarea value={symptoms} onChange={e=>setSymptoms(e.target.value)} rows={4} placeholder="Describe symptoms, concerns, or reason for visit..."/></div>
                  <button className="btn btn-primary btn-lg" onClick={confirm} disabled={!symptoms}>Confirm Appointment</button>
                </div>}
              </div>
              <div>
                {msg&&<div className={`alert alert-${msgType} mb-md`}>{msg}</div>}
                {!holdId&&<div className="card">
                  <div className="card-title">Select date & time</div>
                  <div className="form-group"><label className="form-label">Date</label><input type="date" value={date} onChange={e=>{setDate(e.target.value);loadSlots(selectedDoctor.id,e.target.value);}}/></div>
                  <div className="card-title" style={{marginTop:12}}>Available slots</div>
                  {slots.length===0?<p className="text-muted text-sm">No available slots for this date.</p>:<div className="slot-grid">{slots.map(s=><div key={s.startTime} className="slot-btn" onClick={()=>holdSlot(s)}>{s.startTime}</div>)}</div>}
                </div>}
              </div>
            </div>
          </>)}

          {/* APPOINTMENTS */}
          {view==="appointments"&&!apptDetail&&(<>
            <div className="flex-between mb-md"><div><p style={{fontSize:14,fontWeight:600}}>Appointments</p><p className="text-muted" style={{fontSize:12}}>Track and manage your consultations.</p></div></div>
            <div className="tabs"><button className="tab active">All</button><button className="tab">Upcoming</button><button className="tab">Completed</button></div>
            {appointments.length===0?<div className="card"><div className="empty"><Calendar size={24}/><h3>No appointments</h3><p>Book a consultation to get started.</p><button className="btn btn-accent btn-sm" onClick={()=>setView("doctors")}>Find a doctor</button></div></div>:
            appointments.map(a=>{const d=new Date(a.slotDate);return <div key={a.id} className="appt-row" onClick={()=>viewDetail(a.id)}><div className="appt-date"><div className="d">{d.getUTCDate()}</div><div className="m">{d.toLocaleString("en",{month:"short",timeZone:"UTC"})}</div></div><div className="appt-info"><h4>Dr. {a.doctorProfile?.user?.firstName} {a.doctorProfile?.user?.lastName}</h4><p>{a.doctorProfile?.specialisation?.name} · {a.slotStartTime}</p></div><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></div>;})}
          </>)}

          {/* APPOINTMENT DETAIL */}
          {view==="appointments"&&apptDetail&&(<>
            <button className="btn btn-ghost btn-sm mb-md" onClick={()=>setApptDetail(null)}><ArrowLeft size={12}/>Back</button>
            <div className="grid-2" style={{gridTemplateColumns:"2fr 1fr"}}>
              <div>
                <div className="card mb-md">
                  <div className="flex-between mb-sm"><div className="card-title">Appointment Details</div><span className={`badge badge-${apptDetail.status.toLowerCase()}`}>{apptDetail.status}</span></div>
                  <div className="form-row mb-sm">
                    <div><div className="form-label">Doctor</div><span style={{fontSize:12,fontWeight:500}}>Dr. {apptDetail.doctorProfile?.user?.firstName} {apptDetail.doctorProfile?.user?.lastName}</span></div>
                    <div><div className="form-label">Specialty</div><span style={{fontSize:12}}>{apptDetail.doctorProfile?.specialisation?.name}</span></div>
                  </div>
                  <div className="form-row">
                    <div><div className="form-label">Date</div><span style={{fontSize:12}}>{apptDetail.slotDate?.split("T")[0]}</span></div>
                    <div><div className="form-label">Time</div><span style={{fontSize:12}}>{apptDetail.slotStartTime} – {apptDetail.slotEndTime}</span></div>
                  </div>
                  {apptDetail.symptomSubmission&&<div style={{marginTop:12,padding:10,background:"var(--bg)",borderRadius:6}}><div className="form-label">Symptoms reported</div><p style={{fontSize:12,color:"var(--text-2)"}}>{apptDetail.symptomSubmission.symptoms}</p></div>}
                </div>
                {apptDetail.postSummary&&!apptDetail.postSummary.status&&!apptDetail.postSummary.isFailure&&(
                  <div className="ai-section"><div className="ai-label"><Activity size={12}/>AI Post-Visit Summary</div><p><strong>Summary:</strong> {apptDetail.postSummary.patientExplanation}</p><p><strong>Medications:</strong> {apptDetail.postSummary.medicationSchedule}</p><p><strong>Follow-up:</strong> {apptDetail.postSummary.followUpSteps}</p><p className="ai-disclaimer">AI-generated — not a medical diagnosis. Consult your doctor.</p></div>
                )}
              </div>
              <div><div className="card"><div className="card-title">Timeline</div><div style={{fontSize:11,color:"var(--text-3)"}}><p style={{padding:"6px 0",borderBottom:"1px solid var(--border)"}}>Appointment booked</p><p style={{padding:"6px 0",borderBottom:"1px solid var(--border)"}}>Symptoms submitted</p><p style={{padding:"6px 0"}}>Status: {apptDetail.status}</p></div></div></div>
            </div>
          </>)}

          {/* MEDICATIONS */}
          {view==="medications"&&(<>
            <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>Medications</p>
            <p className="text-muted mb-lg" style={{fontSize:12}}>Your prescriptions and medication schedule.</p>
            <div className="card"><div className="empty"><Pill size={24}/><h3>No active medications</h3><p>Medications will appear here after your doctor prescribes them.</p></div></div>
          </>)}

          {/* NOTIFICATIONS */}
          {view==="notifications"&&(<>
            <p style={{fontSize:14,fontWeight:600,marginBottom:4}}>Notifications</p>
            <p className="text-muted mb-lg" style={{fontSize:12}}>Stay updated on your healthcare activity.</p>
            {notifications.length===0?<div className="card"><div className="empty"><Bell size={24}/><h3>No notifications</h3><p>You'll receive updates about appointments and medications here.</p></div></div>:
            <div>{notifications.map((n:any)=><div key={n.id} className="appt-row" style={{cursor:"default"}}><div className="appt-info"><h4>{n.subject}</h4><p>{n.body?.slice(0,80)}</p></div><span className={`badge badge-${n.status.toLowerCase()}`}>{n.status}</span></div>)}</div>}
          </>)}
        </div>
      </div>
    </div>
  );
}
