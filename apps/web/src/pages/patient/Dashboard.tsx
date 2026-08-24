import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import { Calendar, CheckCircle, Users, ClipboardList, Search, Clock, ArrowLeft, LogOut } from "lucide-react";

export default function PatientDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"dashboard"|"doctors"|"appointments"|"book">("dashboard");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [date, setDate] = useState(()=>{ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; });
  const [holdId, setHoldId] = useState<string|null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success"|"error">("success");
  const [apptDetail, setApptDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ loadDoctors(); loadAppointments(); },[]);
  const loadDoctors=async()=>{ setLoading(true); const r=await api.get("/api/doctors",token); if(r.data) setDoctors(r.data); setLoading(false); };
  const loadAppointments=async()=>{ const r=await api.get("/api/appointments",token); if(r.data) setAppointments(r.data); };
  const loadSlots=async(id:string,d:string)=>{ const r=await api.get(`/api/doctors/${id}/availability?date=${d}`,token); if(r.data) setSlots(r.data.slots); };
  const selectDoc=(d:any)=>{ setSelectedDoctor(d); setView("book"); setHoldId(null); setSymptoms(""); setMsg(""); loadSlots(d.id,date); };
  const holdSlot=async(s:any)=>{ setMsg(""); const r=await api.post("/api/appointments/hold",{doctorProfileId:selectedDoctor.id,slotDate:date,slotStartTime:s.startTime,slotEndTime:s.endTime},token); if(r.data){setHoldId(r.data.id);setMsg("Slot reserved for 5 minutes.");setMsgType("success");}else{setMsg(r.error?.message||"Unavailable");setMsgType("error");}};
  const confirm=async()=>{ if(!holdId||!symptoms)return; const r=await api.post("/api/appointments/confirm",{holdId,symptoms},token); if(r.data){setMsg("Appointment confirmed.");setMsgType("success");setHoldId(null);setSymptoms("");loadAppointments();setTimeout(()=>setView("appointments"),1200);}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const viewDetail=async(id:string)=>{ const r=await api.get(`/api/appointments/${id}`,token); if(r.data){const ps=await api.get(`/api/appointments/${id}/post-summary`,token);setApptDetail({...r.data,postSummary:ps.data});}};

  const upcoming=appointments.filter(a=>a.status==="CONFIRMED");
  const initials=user?`${user.firstName[0]}${user.lastName[0]}`:"";

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand"><Calendar size={18}/><span>CareSync</span></div>
        <div className="nav-links">
          <button className={view==="dashboard"?"active":""} onClick={()=>{setView("dashboard");setApptDetail(null);}}>Dashboard</button>
          <button className={view==="doctors"?"active":""} onClick={()=>{setView("doctors");setApptDetail(null);}}>Find Doctors</button>
          <button className={view==="appointments"?"active":""} onClick={()=>{setView("appointments");setApptDetail(null);}}>Appointments</button>
        </div>
        <div className="nav-right">
          <div className="nav-avatar">{initials}</div>
          <span className="nav-user">{user?.firstName}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14}/></button>
        </div>
      </nav>

      <div className="main">
        {view==="dashboard"&&(<>
          <h1 className="page-title">Welcome back, {user?.firstName}</h1>
          <p className="page-desc">Here's an overview of your healthcare activity.</p>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-icon i-blue"><Calendar size={18}/></div><div><div className="stat-val">{upcoming.length}</div><div className="stat-label">Upcoming</div></div></div>
            <div className="stat-card"><div className="stat-icon i-green"><CheckCircle size={18}/></div><div><div className="stat-val">{appointments.filter(a=>a.status==="COMPLETED").length}</div><div className="stat-label">Completed</div></div></div>
            <div className="stat-card"><div className="stat-icon i-purple"><Users size={18}/></div><div><div className="stat-val">{doctors.length}</div><div className="stat-label">Doctors</div></div></div>
            <div className="stat-card"><div className="stat-icon i-amber"><ClipboardList size={18}/></div><div><div className="stat-val">{appointments.length}</div><div className="stat-label">Total</div></div></div>
          </div>

          <div className="section">
            <div className="card">
              <div className="card-header"><span className="card-title">Upcoming Appointments</span></div>
              {upcoming.length===0?(<div className="empty"><Search size={32}/><h3>No upcoming appointments</h3><p>Book a consultation to get started.</p><button className="btn btn-accent" onClick={()=>setView("doctors")}>Find a doctor</button></div>):(
                <div className="appt-list">{upcoming.slice(0,4).map(a=>{const d=new Date(a.slotDate);return(<div key={a.id} className="appt-item" onClick={()=>{viewDetail(a.id);setView("appointments");}}><div className="appt-date-box"><div className="d">{d.getUTCDate()}</div><div className="m">{d.toLocaleString("en",{month:"short",timeZone:"UTC"})}</div></div><div className="appt-info"><h4>Dr. {a.doctorProfile?.user?.firstName} {a.doctorProfile?.user?.lastName}</h4><p>{a.doctorProfile?.specialisation?.name} &middot; {a.slotStartTime}</p></div><span className="badge badge-confirmed">Confirmed</span></div>);})}</div>
              )}
            </div>
          </div>
        </>)}

        {view==="doctors"&&(<>
          <h1 className="page-title">Find Doctors</h1>
          <p className="page-desc">Browse our network of healthcare professionals.</p>
          {loading?(<div className="doc-grid">{[1,2,3].map(i=><div key={i} className="doc-card"><div style={{display:"flex",gap:12}}><div className="skel" style={{width:44,height:44,borderRadius:"50%"}}/><div><div className="skel" style={{width:120,height:14,marginBottom:6}}/><div className="skel" style={{width:80,height:12}}/></div></div></div>)}</div>):
          doctors.length===0?(<div className="empty"><Search size={32}/><h3>No doctors available</h3><p>Please check back later.</p></div>):(
          <div className="doc-grid">{doctors.map(d=>(<div key={d.id} className="doc-card"><div className="doc-card-top"><div className="doc-avatar">{d.user.firstName[0]}{d.user.lastName[0]}</div><div><div className="doc-name">Dr. {d.user.firstName} {d.user.lastName}</div><div className="doc-spec">{d.specialisation?.name}</div></div></div><div className="doc-meta"><span><Clock size={12}/>{d.consultationDurationMin} min</span><span><ClipboardList size={12}/>{d.qualifications?.slice(0,2).join(", ")}</span></div><div className="doc-actions"><button className="btn btn-accent btn-sm" onClick={()=>selectDoc(d)}>Book</button><button className="btn btn-outline btn-sm" onClick={()=>selectDoc(d)}>View</button></div></div>))}</div>
          )}
        </>)}

        {view==="book"&&selectedDoctor&&(<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setView("doctors")} style={{marginBottom:16}}><ArrowLeft size={14}/>Back</button>
          <div className="card" style={{marginBottom:16}}>
            <div className="doc-card-top"><div className="doc-avatar">{selectedDoctor.user.firstName[0]}{selectedDoctor.user.lastName[0]}</div><div><div className="doc-name">Dr. {selectedDoctor.user.firstName} {selectedDoctor.user.lastName}</div><div className="doc-spec">{selectedDoctor.specialisation?.name} &middot; {selectedDoctor.consultationDurationMin} min</div></div></div>
          </div>
          {msg&&<div className={`alert alert-${msgType}`}>{msg}</div>}
          {!holdId&&(<div className="card">
            <div className="card-title" style={{marginBottom:14}}>Select date & time</div>
            <div className="form-group"><label className="form-label">Date</label><input type="date" value={date} onChange={e=>{setDate(e.target.value);loadSlots(selectedDoctor.id,e.target.value);}}/></div>
            {slots.length===0?<p className="text-muted text-sm">No available slots for this date.</p>:<div className="slot-grid">{slots.map(s=><div key={s.startTime} className="slot-btn" onClick={()=>holdSlot(s)}>{s.startTime}</div>)}</div>}
          </div>)}
          {holdId&&(<div className="card">
            <div className="card-title" style={{marginBottom:14}}>Describe your symptoms</div>
            <div className="form-group"><label className="form-label">What brings you in?</label><textarea value={symptoms} onChange={e=>setSymptoms(e.target.value)} rows={4} placeholder="Describe your symptoms or reason for visit..."/></div>
            <button className="btn btn-primary btn-lg" onClick={confirm} disabled={!symptoms}>Confirm appointment</button>
          </div>)}
        </>)}

        {view==="appointments"&&!apptDetail&&(<>
          <h1 className="page-title">Appointments</h1>
          <p className="page-desc">Track and manage your consultations.</p>
          {appointments.length===0?(<div className="card"><div className="empty"><Calendar size={32}/><h3>No appointments</h3><p>You haven't booked any appointments yet.</p><button className="btn btn-accent" onClick={()=>setView("doctors")}>Find a doctor</button></div></div>):(
          <div className="appt-list">{appointments.map(a=>{const d=new Date(a.slotDate);return(<div key={a.id} className="appt-item" onClick={()=>viewDetail(a.id)}><div className="appt-date-box"><div className="d">{d.getUTCDate()}</div><div className="m">{d.toLocaleString("en",{month:"short",timeZone:"UTC"})}</div></div><div className="appt-info"><h4>Dr. {a.doctorProfile?.user?.firstName} {a.doctorProfile?.user?.lastName}</h4><p>{a.doctorProfile?.specialisation?.name} &middot; {a.slotStartTime}</p></div><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></div>);})}</div>
          )}
        </>)}

        {view==="appointments"&&apptDetail&&(<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setApptDetail(null)} style={{marginBottom:16}}><ArrowLeft size={14}/>Back</button>
          <div className="card">
            <div className="flex-between" style={{marginBottom:14}}><span className="card-title">Appointment Details</span><span className={`badge badge-${apptDetail.status.toLowerCase()}`}>{apptDetail.status}</span></div>
            <div className="form-row" style={{marginBottom:12}}>
              <div><div className="form-label">Doctor</div><div style={{fontWeight:600,fontSize:13}}>Dr. {apptDetail.doctorProfile?.user?.firstName} {apptDetail.doctorProfile?.user?.lastName}</div></div>
              <div><div className="form-label">Specialty</div><div style={{fontSize:13}}>{apptDetail.doctorProfile?.specialisation?.name}</div></div>
              <div><div className="form-label">Date</div><div style={{fontSize:13}}>{apptDetail.slotDate?.split("T")[0]}</div></div>
              <div><div className="form-label">Time</div><div style={{fontSize:13}}>{apptDetail.slotStartTime} – {apptDetail.slotEndTime}</div></div>
            </div>
            {apptDetail.symptomSubmission&&<div style={{marginTop:12}}><div className="form-label">Symptoms reported</div><p style={{fontSize:13,color:"var(--text-secondary)"}}>{apptDetail.symptomSubmission.symptoms}</p></div>}
          </div>
          {apptDetail.postSummary&&!apptDetail.postSummary.status&&!apptDetail.postSummary.isFailure&&(
            <div className="ai-card"><div className="ai-label">AI-Generated Post-Visit Summary</div><p><strong>Summary:</strong> {apptDetail.postSummary.patientExplanation}</p><p><strong>Medications:</strong> {apptDetail.postSummary.medicationSchedule}</p><p><strong>Follow-up:</strong> {apptDetail.postSummary.followUpSteps}</p><p className="ai-disclaimer">This is an AI-generated summary and not a medical diagnosis.</p></div>
          )}
        </>)}
      </div>
    </div>
  );
}
