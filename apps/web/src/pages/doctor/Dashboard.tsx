import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import { Calendar, ArrowLeft, LogOut, Stethoscope } from "lucide-react";

export default function DoctorDashboard() {
  const { user, token, logout } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [preSummary, setPreSummary] = useState<any>(null);
  const [visitNote, setVisitNote] = useState<any>(null);
  const [noteForm, setNoteForm] = useState({ doctorNotes: "", diagnosis: "" });
  const [rxForm, setRxForm] = useState({ instructions: "", medications: [{ name: "", dosage: "", frequency: "ONCE_DAILY", duration: "", startDate: "", endDate: "" }] });
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success"|"error">("success");

  useEffect(()=>{ loadAppointments(); },[]);
  const loadAppointments=async()=>{ const r=await api.get("/api/appointments",token); if(r.data)setAppointments(r.data); };
  const selectAppt=async(a:any)=>{ setSelected(a);setMsg("");setVisitNote(null);setPreSummary(null); const pre=await api.get(`/api/appointments/${a.id}/pre-summary`,token);if(pre.data)setPreSummary(pre.data); const vn=await api.get(`/api/appointments/${a.id}/visit-note`,token);if(vn.data&&!vn.error)setVisitNote(vn.data); };
  const submitNote=async()=>{ const r=await api.post(`/api/appointments/${selected.id}/visit-note`,noteForm,token);if(r.data){setVisitNote(r.data);setMsg("Note saved");setMsgType("success");}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const submitRx=async()=>{ const r=await api.post(`/api/appointments/${selected.id}/prescription`,rxForm,token);if(r.data){setMsg("Prescription saved");setMsgType("success");}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const initials=user?`${user.firstName[0]}${user.lastName[0]}`:"";

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand"><Stethoscope size={18}/><span>CareSync</span></div>
        <div className="nav-links"><span style={{fontSize:12,color:"var(--text-muted)",padding:"8px 14px"}}>Doctor Portal</span></div>
        <div className="nav-right"><div className="nav-avatar">{initials}</div><span className="nav-user">Dr. {user?.lastName}</span><button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14}/></button></div>
      </nav>
      <div className="main">
        {!selected&&(<>
          <h1 className="page-title">Schedule</h1>
          <p className="page-desc">Manage your patient appointments.</p>
          {appointments.length===0?(<div className="card"><div className="empty"><Calendar size={32}/><h3>No appointments</h3><p>No scheduled appointments.</p></div></div>):(
          <div className="appt-list">{appointments.map(a=>{const d=new Date(a.slotDate);return(<div key={a.id} className="appt-item" onClick={()=>selectAppt(a)}><div className="appt-date-box"><div className="d">{d.getUTCDate()}</div><div className="m">{d.toLocaleString("en",{month:"short",timeZone:"UTC"})}</div></div><div className="appt-info"><h4>{a.patient?.firstName} {a.patient?.lastName}</h4><p>{a.slotStartTime} – {a.slotEndTime}</p></div><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></div>);})}</div>)}
        </>)}
        {selected&&(<>
          <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)} style={{marginBottom:16}}><ArrowLeft size={14}/>Back</button>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title" style={{marginBottom:12}}>Patient: {selected.patient?.firstName} {selected.patient?.lastName}</div>
            <div className="form-row"><div><div className="form-label">Date</div><span style={{fontSize:13}}>{selected.slotDate?.split("T")[0]}</span></div><div><div className="form-label">Time</div><span style={{fontSize:13}}>{selected.slotStartTime}</span></div></div>
            {selected.symptomSubmission&&<div style={{marginTop:12,padding:12,background:"var(--bg)",borderRadius:6}}><div className="form-label">Reported symptoms</div><p style={{fontSize:13,color:"var(--text-secondary)"}}>{selected.symptomSubmission.symptoms}</p></div>}
          </div>
          {preSummary&&!preSummary.isFailure&&preSummary.urgencyLevel&&(
            <div className="ai-card" style={{marginBottom:12}}><div className="ai-label">AI Pre-Visit Summary</div><div className="flex gap-sm mb-sm"><span className={`badge badge-${preSummary.urgencyLevel.toLowerCase()}`}>{preSummary.urgencyLevel}</span></div><p><strong>Chief complaint:</strong> {preSummary.chiefComplaint}</p><p style={{marginTop:4}}><strong>Suggested questions:</strong></p><ul style={{paddingLeft:18,marginTop:4}}>{preSummary.suggestedQuestions?.map((q:string,i:number)=><li key={i} style={{fontSize:12,marginBottom:2}}>{q}</li>)}</ul><p className="ai-disclaimer">AI-generated triage hint — not a diagnosis.</p></div>
          )}
          {msg&&<div className={`alert alert-${msgType}`}>{msg}</div>}
          {!visitNote&&(<div className="card" style={{marginBottom:12}}><div className="card-title" style={{marginBottom:12}}>Visit Note</div><div className="form-group"><label className="form-label">Clinical notes</label><textarea value={noteForm.doctorNotes} onChange={e=>setNoteForm({...noteForm,doctorNotes:e.target.value})} rows={4} placeholder="Document findings..."/></div><div className="form-group"><label className="form-label">Diagnosis</label><input value={noteForm.diagnosis} onChange={e=>setNoteForm({...noteForm,diagnosis:e.target.value})} placeholder="Primary diagnosis"/></div><button className="btn btn-primary" onClick={submitNote}>Save note</button></div>)}
          {visitNote&&(<>
            <div className="card" style={{marginBottom:12,borderLeft:"3px solid var(--success)"}}><div className="card-title" style={{marginBottom:6}}>Visit Note</div><p style={{fontSize:13,color:"var(--text-secondary)"}}>{visitNote.doctorNotes}</p>{visitNote.diagnosis&&<p style={{fontSize:12,marginTop:4}}><strong>Diagnosis:</strong> {visitNote.diagnosis}</p>}</div>
            <div className="card"><div className="card-title" style={{marginBottom:12}}>Prescription</div>
              <div className="form-group"><label className="form-label">Instructions</label><input value={rxForm.instructions} onChange={e=>setRxForm({...rxForm,instructions:e.target.value})} placeholder="General instructions"/></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Medication</label><input value={rxForm.medications[0].name} onChange={e=>{const m=[...rxForm.medications];m[0].name=e.target.value;setRxForm({...rxForm,medications:m});}} placeholder="Drug name"/></div><div className="form-group"><label className="form-label">Dosage</label><input value={rxForm.medications[0].dosage} onChange={e=>{const m=[...rxForm.medications];m[0].dosage=e.target.value;setRxForm({...rxForm,medications:m});}} placeholder="500mg"/></div></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Frequency</label><select value={rxForm.medications[0].frequency} onChange={e=>{const m=[...rxForm.medications];m[0].frequency=e.target.value;setRxForm({...rxForm,medications:m});}}><option value="ONCE_DAILY">Once daily</option><option value="TWICE_DAILY">Twice daily</option><option value="THREE_TIMES_DAILY">Three times daily</option><option value="EVERY_8_HOURS">Every 8 hours</option><option value="EVERY_12_HOURS">Every 12 hours</option></select></div><div className="form-group"><label className="form-label">Duration</label><input value={rxForm.medications[0].duration} onChange={e=>{const m=[...rxForm.medications];m[0].duration=e.target.value;setRxForm({...rxForm,medications:m});}} placeholder="7 days"/></div></div>
              <div className="form-row"><div className="form-group"><label className="form-label">Start</label><input type="date" value={rxForm.medications[0].startDate} onChange={e=>{const m=[...rxForm.medications];m[0].startDate=e.target.value;setRxForm({...rxForm,medications:m});}}/></div><div className="form-group"><label className="form-label">End</label><input type="date" value={rxForm.medications[0].endDate} onChange={e=>{const m=[...rxForm.medications];m[0].endDate=e.target.value;setRxForm({...rxForm,medications:m});}}/></div></div>
              <button className="btn btn-primary" onClick={submitRx}>Save prescription</button>
            </div>
          </>)}
        </>)}
      </div>
    </div>
  );
}
