import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";

export default function PatientDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"doctors" | "appointments" | "book">("doctors");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; });
  const [holdId, setHoldId] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [msg, setMsg] = useState("");
  const [apptDetail, setApptDetail] = useState<any>(null);

  useEffect(() => { loadDoctors(); loadAppointments(); }, []);

  const loadDoctors = async () => { const r = await api.get("/api/doctors", token); if (r.data) setDoctors(r.data); };
  const loadAppointments = async () => { const r = await api.get("/api/appointments", token); if (r.data) setAppointments(r.data); };

  const loadSlots = async (docId: string, d: string) => {
    const r = await api.get(`/api/doctors/${docId}/availability?date=${d}`, token);
    if (r.data) setSlots(r.data.slots);
  };

  const selectDoctor = (doc: any) => { setSelectedDoctor(doc); setView("book"); loadSlots(doc.id, date); };

  const holdSlot = async (slot: any) => {
    setMsg("");
    const r = await api.post("/api/appointments/hold", { doctorProfileId: selectedDoctor.id, slotDate: date, slotStartTime: slot.startTime, slotEndTime: slot.endTime }, token);
    if (r.data) { setHoldId(r.data.id); setMsg("Slot held for 5 minutes. Please enter symptoms and confirm."); }
    else setMsg(r.error?.message || "Failed to hold slot");
  };

  const confirmBooking = async () => {
    if (!holdId || !symptoms) return;
    const r = await api.post("/api/appointments/confirm", { holdId, symptoms }, token);
    if (r.data) { setMsg("Appointment confirmed!"); setHoldId(null); setSymptoms(""); loadAppointments(); setView("appointments"); }
    else setMsg(r.error?.message || "Confirmation failed");
  };

  const viewDetail = async (id: string) => {
    const r = await api.get(`/api/appointments/${id}`, token);
    if (r.data) {
      const postSum = await api.get(`/api/appointments/${id}/post-summary`, token);
      setApptDetail({ ...r.data, postSummary: postSum.data });
    }
  };

  return (
    <div>
      <nav><span>🏥 Patient Portal — {user?.firstName}</span><div><button className="btn btn-sm" onClick={() => setView("doctors")}>Doctors</button> <button className="btn btn-sm" onClick={() => setView("appointments")}>My Appointments</button> <button className="btn btn-sm btn-danger" onClick={logout}>Logout</button></div></nav>
      <div className="container">
        {view === "doctors" && (
          <><h2>Find a Doctor</h2>{doctors.map((d) => (
            <div key={d.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><strong>Dr. {d.user.firstName} {d.user.lastName}</strong><br/><small>{d.specialisation?.name} • {d.consultationDurationMin} min</small></div>
              <button className="btn btn-primary btn-sm" onClick={() => selectDoctor(d)}>Book</button>
            </div>
          ))}</>
        )}
        {view === "book" && selectedDoctor && (
          <><h2>Book with Dr. {selectedDoctor.user.lastName}</h2>
            <label>Date</label><input type="date" value={date} onChange={(e) => { setDate(e.target.value); loadSlots(selectedDoctor.id, e.target.value); }} />
            {msg && <p className={msg.includes("confirmed") ? "success" : "error"}>{msg}</p>}
            {!holdId && (<><h3>Available Slots</h3><div className="slots-grid">{slots.length === 0 ? <p>No slots available</p> : slots.map((s) => (<div key={s.startTime} className="slot-btn" onClick={() => holdSlot(s)}>{s.startTime}–{s.endTime}</div>))}</div></>)}
            {holdId && (<div className="card"><h3>Enter Symptoms</h3><textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Describe your symptoms..." rows={3} /><button className="btn btn-primary" onClick={confirmBooking}>Confirm Appointment</button></div>)}
          </>
        )}
        {view === "appointments" && !apptDetail && (
          <><h2>My Appointments</h2>{appointments.length === 0 ? <p>No appointments yet.</p> : appointments.map((a) => (
            <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => viewDetail(a.id)}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><strong>{a.slotDate?.split("T")[0]} at {a.slotStartTime}</strong><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></div>
              <small>Dr. {a.doctorProfile?.user?.lastName} • {a.doctorProfile?.specialisation?.name}</small>
            </div>
          ))}</>
        )}
        {view === "appointments" && apptDetail && (
          <><button className="btn btn-sm" onClick={() => setApptDetail(null)}>← Back</button>
            <div className="card" style={{ marginTop: "1rem" }}>
              <h3>Appointment Detail</h3>
              <p><strong>Date:</strong> {apptDetail.slotDate?.split("T")[0]} at {apptDetail.slotStartTime}</p>
              <p><strong>Doctor:</strong> Dr. {apptDetail.doctorProfile?.user?.lastName}</p>
              <p><strong>Status:</strong> <span className={`badge badge-${apptDetail.status.toLowerCase()}`}>{apptDetail.status}</span></p>
              {apptDetail.symptomSubmission && <p><strong>Symptoms:</strong> {apptDetail.symptomSubmission.symptoms}</p>}
            </div>
            {apptDetail.postSummary && !apptDetail.postSummary.status && !apptDetail.postSummary.isFailure && (
              <div className="ai-badge"><p>{apptDetail.postSummary.patientExplanation}</p><p><strong>Medications:</strong> {apptDetail.postSummary.medicationSchedule}</p><p><strong>Follow-up:</strong> {apptDetail.postSummary.followUpSteps}</p><p className="disclaimer">This is AI-generated and not a medical diagnosis.</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
