import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";

export default function DoctorDashboard() {
  const { user, token, logout } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [preSummary, setPreSummary] = useState<any>(null);
  const [visitNote, setVisitNote] = useState<any>(null);
  const [noteForm, setNoteForm] = useState({ doctorNotes: "", diagnosis: "" });
  const [rxForm, setRxForm] = useState({ instructions: "", medications: [{ name: "", dosage: "", frequency: "ONCE_DAILY", duration: "", startDate: "", endDate: "" }] });
  const [msg, setMsg] = useState("");

  useEffect(() => { loadAppointments(); }, []);

  const loadAppointments = async () => { const r = await api.get("/api/appointments", token); if (r.data) setAppointments(r.data); };

  const selectAppt = async (a: any) => {
    setSelected(a); setMsg(""); setVisitNote(null); setPreSummary(null);
    const pre = await api.get(`/api/appointments/${a.id}/pre-summary`, token);
    if (pre.data) setPreSummary(pre.data);
    const vn = await api.get(`/api/appointments/${a.id}/visit-note`, token);
    if (vn.data && !vn.error) setVisitNote(vn.data);
  };

  const submitNote = async () => {
    const r = await api.post(`/api/appointments/${selected.id}/visit-note`, noteForm, token);
    if (r.data) { setVisitNote(r.data); setMsg("Visit note saved"); } else setMsg(r.error?.message || "Failed");
  };

  const submitRx = async () => {
    const r = await api.post(`/api/appointments/${selected.id}/prescription`, rxForm, token);
    if (r.data) { setMsg("Prescription saved"); } else setMsg(r.error?.message || "Failed");
  };

  return (
    <div>
      <nav><span>🩺 Doctor Portal — Dr. {user?.lastName}</span><button className="btn btn-sm btn-danger" onClick={logout}>Logout</button></nav>
      <div className="container">
        {!selected && (<><h2>Appointments</h2>{appointments.map((a) => (
          <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => selectAppt(a)}>
            <strong>{a.slotDate?.split("T")[0]} {a.slotStartTime}</strong> — {a.patient?.firstName} {a.patient?.lastName}
            <span className={`badge badge-${a.status.toLowerCase()}`} style={{ marginLeft: 8 }}>{a.status}</span>
          </div>
        ))}</>)}
        {selected && (<>
          <button className="btn btn-sm" onClick={() => setSelected(null)}>← Back</button>
          <div className="card" style={{ marginTop: "1rem" }}><h3>Patient: {selected.patient?.firstName} {selected.patient?.lastName}</h3><p>{selected.slotDate?.split("T")[0]} at {selected.slotStartTime}</p>{selected.symptomSubmission && <p><strong>Symptoms:</strong> {selected.symptomSubmission.symptoms}</p>}</div>
          {preSummary && !preSummary.isFailure && preSummary.urgencyLevel && (
            <div className="ai-badge"><strong>Urgency:</strong> <span className={`badge badge-${preSummary.urgencyLevel.toLowerCase()}`}>{preSummary.urgencyLevel}</span><p>{preSummary.chiefComplaint}</p><ul>{preSummary.suggestedQuestions?.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul><p className="disclaimer">AI-generated triage hint, not a diagnosis.</p></div>
          )}
          {msg && <p className="success">{msg}</p>}
          {!visitNote && (<div className="card"><h3>Visit Note</h3><label>Notes</label><textarea value={noteForm.doctorNotes} onChange={(e) => setNoteForm({ ...noteForm, doctorNotes: e.target.value })} rows={3} /><label>Diagnosis</label><input value={noteForm.diagnosis} onChange={(e) => setNoteForm({ ...noteForm, diagnosis: e.target.value })} /><button className="btn btn-primary" onClick={submitNote}>Save Note</button></div>)}
          {visitNote && (<div className="card"><h3>✓ Visit Note Saved</h3><p>{visitNote.doctorNotes}</p><hr style={{ margin: "1rem 0" }} /><h3>Prescription</h3><label>Instructions</label><input value={rxForm.instructions} onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })} /><label>Medication Name</label><input value={rxForm.medications[0].name} onChange={(e) => { const m = [...rxForm.medications]; m[0].name = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /><label>Dosage</label><input value={rxForm.medications[0].dosage} onChange={(e) => { const m = [...rxForm.medications]; m[0].dosage = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /><label>Frequency</label><select value={rxForm.medications[0].frequency} onChange={(e) => { const m = [...rxForm.medications]; m[0].frequency = e.target.value; setRxForm({ ...rxForm, medications: m }); }}><option>ONCE_DAILY</option><option>TWICE_DAILY</option><option>THREE_TIMES_DAILY</option><option>EVERY_8_HOURS</option><option>EVERY_12_HOURS</option></select><label>Duration</label><input value={rxForm.medications[0].duration} onChange={(e) => { const m = [...rxForm.medications]; m[0].duration = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /><label>Start Date</label><input type="date" value={rxForm.medications[0].startDate} onChange={(e) => { const m = [...rxForm.medications]; m[0].startDate = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /><label>End Date</label><input type="date" value={rxForm.medications[0].endDate} onChange={(e) => { const m = [...rxForm.medications]; m[0].endDate = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /><button className="btn btn-primary" onClick={submitRx}>Save Prescription</button></div>)}
        </>)}
      </div>
    </div>
  );
}
