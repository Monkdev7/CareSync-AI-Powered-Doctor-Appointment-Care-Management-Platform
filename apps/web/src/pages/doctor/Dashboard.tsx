import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";
import { LayoutDashboard, Calendar, ClipboardList, FileText, LogOut, ArrowLeft, Activity, Stethoscope, Users } from "lucide-react";

export default function DoctorDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"schedule"|"selected">("schedule");
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [preSummary, setPreSummary] = useState<any>(null);
  const [visitNote, setVisitNote] = useState<any>(null);
  const [noteForm, setNoteForm] = useState({ doctorNotes: "", diagnosis: "" });
  const [rxForm, setRxForm] = useState({ instructions: "", medications: [{ name: "", dosage: "", frequency: "ONCE_DAILY", duration: "", startDate: "", endDate: "" }] });
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success"|"error">("success");

  useEffect(()=>{ load(); },[]);
  const load=async()=>{ const r=await api.get("/api/appointments",token); if(r.data) setAppointments(r.data); };
  const selectAppt=async(a:any)=>{ setSelected(a);setView("selected");setMsg("");setVisitNote(null);setPreSummary(null); const pre=await api.get(`/api/appointments/${a.id}/pre-summary`,token);if(pre.data)setPreSummary(pre.data); const vn=await api.get(`/api/appointments/${a.id}/visit-note`,token);if(vn.data&&!vn.error)setVisitNote(vn.data); };
  const submitNote=async()=>{ const r=await api.post(`/api/appointments/${selected.id}/visit-note`,noteForm,token);if(r.data){setVisitNote(r.data);setMsg("Visit note saved.");setMsgType("success");}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const submitRx=async()=>{ const r=await api.post(`/api/appointments/${selected.id}/prescription`,rxForm,token);if(r.data){setMsg("Prescription saved.");setMsgType("success");}else{setMsg(r.error?.message||"Failed");setMsgType("error");}};
  const initials=user?`${user.firstName[0]}${user.lastName[0]}`:"";
  const confirmed=appointments.filter(a=>a.status==="CONFIRMED");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Stethoscope size={18}/>CareSync</div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Clinical</div>
            <button className={`sidebar-link ${view==="schedule"?"active":""}`} onClick={()=>{setView("schedule");setSelected(null);}}><Calendar size={16}/>Schedule</button>
            <button className="sidebar-link"><Users size={16}/>Patients</button>
            <button className="sidebar-link"><FileText size={16}/>Visit Notes</button>
            <button className="sidebar-link"><ClipboardList size={16}/>Prescriptions</button>
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user"><div className="av">{initials}</div><div className="info"><div className="name">Dr. {user?.lastName}</div><div className="role">Doctor</div></div></div>
          <button className="sidebar-link" onClick={logout} style={{marginTop:8}}><LogOut size={14}/>Sign out</button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar"><span className="topbar-title">{view==="schedule"?"Schedule":"Patient Appointment"}</span></header>
        <div className="content">
          {view==="schedule"&&(<>
            <div className="stats" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
              <div className="stat"><div className="stat-label">Today's patients</div><div className="stat-value">{confirmed.length}</div></div>
              <div className="stat"><div className="stat-label">Completed</div><div className="stat-value">{appointments.filter(a=>a.status==="COMPLETED").length}</div></div>
              <div className="stat"><div className="stat-label">Total</div><div className="stat-value">{appointments.length}</div></div>
            </div>
            <div className="card">
              <div className="card-title">Appointments</div>
              {appointments.length===0?<div className="empty"><Calendar size={24}/><h3>No appointments</h3><p>No scheduled patients.</p></div>:
              appointments.map(a=>{const d=new Date(a.slotDate);return <div key={a.id} className="appt-row" onClick={()=>selectAppt(a)}><div className="appt-date"><div className="d">{d.getUTCDate()}</div><div className="m">{d.toLocaleString("en",{month:"short",timeZone:"UTC"})}</div></div><div className="appt-info"><h4>{a.patient?.firstName} {a.patient?.lastName}</h4><p>{a.slotStartTime} – {a.slotEndTime}</p></div><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></div>;})}
            </div>
          </>)}

          {view==="selected"&&selected&&(<>
            <button className="btn btn-ghost btn-sm mb-md" onClick={()=>{setView("schedule");setSelected(null);}}><ArrowLeft size={12}/>Back</button>
            <div className="grid-2" style={{gridTemplateColumns:"1fr 1fr"}}>
              <div>
                <div className="card mb-md">
                  <div className="card-title">Patient Information</div>
                  <div className="form-row"><div><div className="form-label">Name</div><span style={{fontSize:12,fontWeight:500}}>{selected.patient?.firstName} {selected.patient?.lastName}</span></div><div><div className="form-label">Time</div><span style={{fontSize:12}}>{selected.slotDate?.split("T")[0]} · {selected.slotStartTime}</span></div></div>
                  {selected.symptomSubmission&&<div style={{marginTop:12,padding:10,background:"var(--bg)",borderRadius:6}}><div className="form-label">Reported symptoms</div><p style={{fontSize:12,color:"var(--text-2)"}}>{selected.symptomSubmission.symptoms}</p></div>}
                </div>

                {preSummary&&!preSummary.isFailure&&preSummary.urgencyLevel&&(
                  <div className="ai-section mb-md"><div className="ai-label"><Activity size={12}/>AI Pre-Visit Summary</div><div className="flex gap-sm mb-sm"><span className={`badge badge-${preSummary.urgencyLevel.toLowerCase()}`}>{preSummary.urgencyLevel}</span></div><p><strong>Chief complaint:</strong> {preSummary.chiefComplaint}</p><p style={{marginTop:4}}><strong>Suggested questions:</strong></p><ul style={{paddingLeft:16,marginTop:4}}>{preSummary.suggestedQuestions?.map((q:string,i:number)=><li key={i} style={{fontSize:11,marginBottom:2}}>{q}</li>)}</ul><p className="ai-disclaimer">AI-generated triage assistance only.</p></div>
                )}

                {msg&&<div className={`alert alert-${msgType} mb-md`}>{msg}</div>}
              </div>
              <div>
                {!visitNote&&<div className="card mb-md"><div className="card-title">Clinical Notes</div><div className="form-group"><label className="form-label">Assessment / Notes</label><textarea value={noteForm.doctorNotes} onChange={e=>setNoteForm({...noteForm,doctorNotes:e.target.value})} rows={5} placeholder="Document findings..."/></div><div className="form-group"><label className="form-label">Diagnosis</label><input value={noteForm.diagnosis} onChange={e=>setNoteForm({...noteForm,diagnosis:e.target.value})} placeholder="Primary diagnosis"/></div><button className="btn btn-primary" onClick={submitNote}>Save Note</button></div>}
                {visitNote&&(<>
                  <div className="card mb-md" style={{borderLeft:"3px solid var(--success)"}}><div className="card-title">Visit Note</div><p style={{fontSize:12,color:"var(--text-2)"}}>{visitNote.doctorNotes}</p>{visitNote.diagnosis&&<p style={{fontSize:11,marginTop:4}}><strong>Dx:</strong> {visitNote.diagnosis}</p>}</div>
                  <div className="card"><div className="card-title">Prescription</div>
                    <div className="form-row"><div className="form-group"><label className="form-label">Medication</label><input value={rxForm.medications[0].name} onChange={e=>{const m=[...rxForm.medications];m[0].name=e.target.value;setRxForm({...rxForm,medications:m});}} placeholder="Drug name"/></div><div className="form-group"><label className="form-label">Dosage</label><input value={rxForm.medications[0].dosage} onChange={e=>{const m=[...rxForm.medications];m[0].dosage=e.target.value;setRxForm({...rxForm,medications:m});}} placeholder="500mg"/></div></div>
                    <div className="form-row"><div className="form-group"><label className="form-label">Frequency</label><select value={rxForm.medications[0].frequency} onChange={e=>{const m=[...rxForm.medications];m[0].frequency=e.target.value;setRxForm({...rxForm,medications:m});}}><option value="ONCE_DAILY">Once daily</option><option value="TWICE_DAILY">Twice daily</option><option value="THREE_TIMES_DAILY">Three times daily</option><option value="EVERY_8_HOURS">Every 8 hours</option><option value="EVERY_12_HOURS">Every 12 hours</option></select></div><div className="form-group"><label className="form-label">Duration</label><input value={rxForm.medications[0].duration} onChange={e=>{const m=[...rxForm.medications];m[0].duration=e.target.value;setRxForm({...rxForm,medications:m});}} placeholder="7 days"/></div></div>
                    <div className="form-row"><div className="form-group"><label className="form-label">Start</label><input type="date" value={rxForm.medications[0].startDate} onChange={e=>{const m=[...rxForm.medications];m[0].startDate=e.target.value;setRxForm({...rxForm,medications:m});}}/></div><div className="form-group"><label className="form-label">End</label><input type="date" value={rxForm.medications[0].endDate} onChange={e=>{const m=[...rxForm.medications];m[0].endDate=e.target.value;setRxForm({...rxForm,medications:m});}}/></div></div>
                    <div className="form-group"><label className="form-label">Instructions</label><input value={rxForm.instructions} onChange={e=>setRxForm({...rxForm,instructions:e.target.value})} placeholder="Take with food"/></div>
                    <button className="btn btn-primary" onClick={submitRx}>Save Prescription</button>
                  </div>
                </>)}
              </div>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}
