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
  const [msgType, setMsgType] = useState<"success" | "error">("success");

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
    if (r.data) { setVisitNote(r.data); setMsg("Visit note saved"); setMsgType("success"); } else { setMsg(r.error?.message || "Failed"); setMsgType("error"); }
  };

  const submitRx = async () => {
    const r = await api.post(`/api/appointments/${selected.id}/prescription`, rxForm, token);
    if (r.data) { setMsg("Prescription saved"); setMsgType("success"); } else { setMsg(r.error?.message || "Failed"); setMsgType("error"); }
  };

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : "";

  return (
    <div className="app-layout">
      <nav className="navbar">
        <div className="navbar-brand"><div className="logo">CS</div><span>CareSync</span></div>
        <div className="navbar-nav"><span style={{ fontSize: "0.85rem", color: "var(--gray-500)" }}>Doctor Portal</span></div>
        <div className="navbar-right">
          <div className="navbar-user"><div className="avatar">{initials}</div><span className="user-name">Dr. {user?.lastName}</span></div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        {!selected && (
          <>
            <div className="page-header"><h1>Today's Schedule</h1><p>View and manage your patient appointments.</p></div>
            {appointments.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📋</div><h3>No appointments</h3><p>You have no scheduled appointments.</p></div>
            ) : (
              <div className="appointments-list">
                {appointments.map((a) => {
                  const d = new Date(a.slotDate);
                  return (
                    <div key={a.id} className="appointment-card" onClick={() => selectAppt(a)} style={{ cursor: "pointer" }}>
                      <div className="appointment-card-left">
                        <div className="appointment-card-date"><div className="day">{d.getUTCDate()}</div><div className="month">{d.toLocaleString("en", { month: "short", timeZone: "UTC" })}</div></div>
                        <div className="appointment-card-info"><h4>{a.patient?.firstName} {a.patient?.lastName}</h4><p>{a.slotStartTime} - {a.slotEndTime}</p></div>
                      </div>
                      <span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {selected && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: "1rem" }}>← Back to Schedule</button>

            <div className="card" style={{ marginBottom: "1rem" }}>
              <h2 style={{ marginBottom: "1rem" }}>Patient: {selected.patient?.firstName} {selected.patient?.lastName}</h2>
              <div className="grid-2">
                <div><p className="text-sm text-muted">Date</p><p>{selected.slotDate?.split("T")[0]}</p></div>
                <div><p className="text-sm text-muted">Time</p><p>{selected.slotStartTime} - {selected.slotEndTime}</p></div>
              </div>
              {selected.symptomSubmission && <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--gray-50)", borderRadius: "var(--radius-sm)" }}><p className="text-sm text-muted" style={{ marginBottom: "0.25rem" }}>Patient Symptoms</p><p>{selected.symptomSubmission.symptoms}</p></div>}
            </div>

            {preSummary && !preSummary.isFailure && preSummary.urgencyLevel && (
              <div className="ai-badge" style={{ marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span className={`badge badge-${preSummary.urgencyLevel.toLowerCase()}`}>{preSummary.urgencyLevel}</span>
                </div>
                <p><strong>Chief complaint:</strong> {preSummary.chiefComplaint}</p>
                <p style={{ marginTop: "0.5rem" }}><strong>Suggested questions:</strong></p>
                <ul style={{ paddingLeft: "1.25rem", marginTop: "0.25rem" }}>{preSummary.suggestedQuestions?.map((q: string, i: number) => <li key={i} style={{ fontSize: "0.85rem" }}>{q}</li>)}</ul>
                <p className="disclaimer">AI-generated triage hint — not a clinical diagnosis.</p>
              </div>
            )}

            {msg && <div className={`alert ${msgType === "success" ? "alert-success" : "alert-error"}`}>{msg}</div>}

            {!visitNote && (
              <div className="card" style={{ marginBottom: "1rem" }}>
                <h3 style={{ marginBottom: "1rem" }}>Visit Note</h3>
                <div className="form-group"><label>Clinical Notes</label><textarea value={noteForm.doctorNotes} onChange={(e) => setNoteForm({ ...noteForm, doctorNotes: e.target.value })} rows={4} placeholder="Document your findings..." /></div>
                <div className="form-group"><label>Diagnosis</label><input value={noteForm.diagnosis} onChange={(e) => setNoteForm({ ...noteForm, diagnosis: e.target.value })} placeholder="Primary diagnosis" /></div>
                <button className="btn btn-primary" onClick={submitNote}>Save Visit Note</button>
              </div>
            )}

            {visitNote && (
              <>
                <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--success)" }}>
                  <h3 style={{ marginBottom: "0.5rem" }}>✓ Visit Note Saved</h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--gray-600)" }}>{visitNote.doctorNotes}</p>
                  {visitNote.diagnosis && <p style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}><strong>Diagnosis:</strong> {visitNote.diagnosis}</p>}
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: "1rem" }}>Prescription</h3>
                  <div className="form-group"><label>Instructions</label><input value={rxForm.instructions} onChange={(e) => setRxForm({ ...rxForm, instructions: e.target.value })} placeholder="General instructions" /></div>
                  <div className="grid-2">
                    <div className="form-group"><label>Medication Name</label><input value={rxForm.medications[0].name} onChange={(e) => { const m = [...rxForm.medications]; m[0].name = e.target.value; setRxForm({ ...rxForm, medications: m }); }} placeholder="e.g., Amoxicillin" /></div>
                    <div className="form-group"><label>Dosage</label><input value={rxForm.medications[0].dosage} onChange={(e) => { const m = [...rxForm.medications]; m[0].dosage = e.target.value; setRxForm({ ...rxForm, medications: m }); }} placeholder="e.g., 500mg" /></div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group"><label>Frequency</label><select value={rxForm.medications[0].frequency} onChange={(e) => { const m = [...rxForm.medications]; m[0].frequency = e.target.value; setRxForm({ ...rxForm, medications: m }); }}><option value="ONCE_DAILY">Once Daily</option><option value="TWICE_DAILY">Twice Daily</option><option value="THREE_TIMES_DAILY">Three Times Daily</option><option value="EVERY_8_HOURS">Every 8 Hours</option><option value="EVERY_12_HOURS">Every 12 Hours</option></select></div>
                    <div className="form-group"><label>Duration</label><input value={rxForm.medications[0].duration} onChange={(e) => { const m = [...rxForm.medications]; m[0].duration = e.target.value; setRxForm({ ...rxForm, medications: m }); }} placeholder="e.g., 7 days" /></div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group"><label>Start Date</label><input type="date" value={rxForm.medications[0].startDate} onChange={(e) => { const m = [...rxForm.medications]; m[0].startDate = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /></div>
                    <div className="form-group"><label>End Date</label><input type="date" value={rxForm.medications[0].endDate} onChange={(e) => { const m = [...rxForm.medications]; m[0].endDate = e.target.value; setRxForm({ ...rxForm, medications: m }); }} /></div>
                  </div>
                  <button className="btn btn-primary" onClick={submitRx}>Save Prescription</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
