import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";

export default function PatientDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"dashboard" | "doctors" | "appointments" | "book">("dashboard");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split("T")[0]; });
  const [holdId, setHoldId] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [apptDetail, setApptDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadDoctors(); loadAppointments(); }, []);

  const loadDoctors = async () => { setLoading(true); const r = await api.get("/api/doctors", token); if (r.data) setDoctors(r.data); setLoading(false); };
  const loadAppointments = async () => { const r = await api.get("/api/appointments", token); if (r.data) setAppointments(r.data); };
  const loadSlots = async (docId: string, d: string) => { const r = await api.get(`/api/doctors/${docId}/availability?date=${d}`, token); if (r.data) setSlots(r.data.slots); };

  const selectDoctor = (doc: any) => { setSelectedDoctor(doc); setView("book"); setHoldId(null); setSymptoms(""); setMsg(""); loadSlots(doc.id, date); };

  const holdSlot = async (slot: any) => {
    setMsg(""); const r = await api.post("/api/appointments/hold", { doctorProfileId: selectedDoctor.id, slotDate: date, slotStartTime: slot.startTime, slotEndTime: slot.endTime }, token);
    if (r.data) { setHoldId(r.data.id); setMsg("Slot held for 5 minutes. Enter symptoms and confirm."); setMsgType("success"); }
    else { setMsg(r.error?.message || "Failed to hold slot"); setMsgType("error"); }
  };

  const confirmBooking = async () => {
    if (!holdId || !symptoms) return;
    const r = await api.post("/api/appointments/confirm", { holdId, symptoms }, token);
    if (r.data) { setMsg("Appointment confirmed!"); setMsgType("success"); setHoldId(null); setSymptoms(""); loadAppointments(); setTimeout(() => setView("appointments"), 1500); }
    else { setMsg(r.error?.message || "Confirmation failed"); setMsgType("error"); }
  };

  const viewDetail = async (id: string) => {
    const r = await api.get(`/api/appointments/${id}`, token);
    if (r.data) { const ps = await api.get(`/api/appointments/${id}/post-summary`, token); setApptDetail({ ...r.data, postSummary: ps.data }); }
  };

  const upcoming = appointments.filter((a) => a.status === "CONFIRMED");
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : "";

  return (
    <div className="app-layout">
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="logo">CS</div>
          <span>CareSync</span>
        </div>
        <div className="navbar-nav">
          <button className={`nav-link ${view === "dashboard" ? "active" : ""}`} onClick={() => { setView("dashboard"); setApptDetail(null); }}>Dashboard</button>
          <button className={`nav-link ${view === "doctors" ? "active" : ""}`} onClick={() => { setView("doctors"); setApptDetail(null); }}>Find Doctors</button>
          <button className={`nav-link ${view === "appointments" ? "active" : ""}`} onClick={() => { setView("appointments"); setApptDetail(null); }}>Appointments</button>
        </div>
        <div className="navbar-right">
          <div className="navbar-user">
            <div className="avatar">{initials}</div>
            <span className="user-name">{user?.firstName}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        {/* Dashboard View */}
        {view === "dashboard" && (
          <>
            <div className="page-header">
              <h1>Good morning, {user?.firstName} 👋</h1>
              <p>Manage your healthcare and appointments in one place.</p>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon blue">📅</div>
                <div className="stat-content"><h3>{upcoming.length}</h3><p>Upcoming Appointments</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green">✓</div>
                <div className="stat-content"><h3>{appointments.filter(a => a.status === "COMPLETED").length}</h3><p>Completed Visits</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple">👨‍⚕️</div>
                <div className="stat-content"><h3>{doctors.length}</h3><p>Available Doctors</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon orange">📋</div>
                <div className="stat-content"><h3>{appointments.length}</h3><p>Total Appointments</p></div>
              </div>
            </div>

            {upcoming.length > 0 && (
              <div style={{ marginBottom: "2rem" }}>
                <h2 style={{ marginBottom: "1rem" }}>Upcoming Appointments</h2>
                <div className="appointments-list">
                  {upcoming.slice(0, 3).map((a) => {
                    const d = new Date(a.slotDate);
                    return (
                      <div key={a.id} className="appointment-card" onClick={() => { viewDetail(a.id); setView("appointments"); }}>
                        <div className="appointment-card-left">
                          <div className="appointment-card-date"><div className="day">{d.getUTCDate()}</div><div className="month">{d.toLocaleString("en", { month: "short", timeZone: "UTC" })}</div></div>
                          <div className="appointment-card-info"><h4>Dr. {a.doctorProfile?.user?.firstName} {a.doctorProfile?.user?.lastName}</h4><p>{a.doctorProfile?.specialisation?.name} • {a.slotStartTime} - {a.slotEndTime}</p></div>
                        </div>
                        <span className="badge badge-confirmed">Confirmed</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
              <h3 style={{ marginBottom: "0.5rem" }}>Need to see a doctor?</h3>
              <p className="text-muted" style={{ marginBottom: "1rem" }}>Browse our network of trusted healthcare professionals</p>
              <button className="btn btn-primary btn-lg" onClick={() => setView("doctors")}>Find a Doctor</button>
            </div>
          </>
        )}

        {/* Doctors View */}
        {view === "doctors" && (
          <>
            <div className="page-header">
              <h1>Find the right doctor for you</h1>
              <p>Search and connect with trusted healthcare professionals.</p>
            </div>
            {loading ? (
              <div className="doctors-grid">{[1,2,3].map(i => <div key={i} className="doctor-card"><div className="skeleton" style={{ width: 56, height: 56, borderRadius: "50%" }} /><div className="skeleton" style={{ height: 20, width: "60%", marginTop: 12 }} /><div className="skeleton" style={{ height: 14, width: "40%", marginTop: 8 }} /></div>)}</div>
            ) : doctors.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">🔍</div><h3>No doctors found</h3><p>Try again later or contact support.</p></div>
            ) : (
              <div className="doctors-grid">
                {doctors.map((d) => (
                  <div key={d.id} className="doctor-card">
                    <div className="doctor-card-header">
                      <div className="doctor-avatar">{d.user.firstName[0]}{d.user.lastName[0]}</div>
                      <div className="doctor-info"><h3>Dr. {d.user.firstName} {d.user.lastName}</h3><p>{d.specialisation?.name}</p></div>
                    </div>
                    <div className="doctor-meta">
                      <span>⏱ {d.consultationDurationMin} min</span>
                      <span>📋 {d.qualifications?.join(", ")}</span>
                    </div>
                    <div className="doctor-card-actions">
                      <button className="btn btn-primary" onClick={() => selectDoctor(d)}>Book Appointment</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Booking View */}
        {view === "book" && selectedDoctor && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setView("doctors")} style={{ marginBottom: "1rem" }}>← Back to Doctors</button>
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div className="doctor-card-header">
                <div className="doctor-avatar">{selectedDoctor.user.firstName[0]}{selectedDoctor.user.lastName[0]}</div>
                <div className="doctor-info"><h3>Dr. {selectedDoctor.user.firstName} {selectedDoctor.user.lastName}</h3><p>{selectedDoctor.specialisation?.name} • {selectedDoctor.consultationDurationMin} min consultation</p></div>
              </div>
            </div>

            {msg && <div className={`alert ${msgType === "success" ? "alert-success" : "alert-error"}`}>{msg}</div>}

            {!holdId && (
              <div className="card">
                <h3 style={{ marginBottom: "1rem" }}>Select a Date & Time</h3>
                <div className="form-group">
                  <label>Appointment Date</label>
                  <input type="date" value={date} onChange={(e) => { setDate(e.target.value); loadSlots(selectedDoctor.id, e.target.value); }} />
                </div>
                <h3 style={{ marginBottom: "0.75rem", marginTop: "1rem" }}>Available Slots</h3>
                {slots.length === 0 ? (
                  <div className="empty-state" style={{ padding: "2rem" }}><div className="empty-icon">📅</div><h3>No slots available</h3><p>Try selecting a different date.</p></div>
                ) : (
                  <div className="slots-grid">{slots.map((s) => <div key={s.startTime} className="slot-btn" onClick={() => holdSlot(s)}>{s.startTime} – {s.endTime}</div>)}</div>
                )}
              </div>
            )}

            {holdId && (
              <div className="card">
                <h3 style={{ marginBottom: "1rem" }}>Describe Your Symptoms</h3>
                <div className="form-group">
                  <label>What brings you in today?</label>
                  <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} placeholder="Please describe your symptoms, concerns, or reason for visit..." rows={4} />
                </div>
                <button className="btn btn-primary btn-lg" onClick={confirmBooking} disabled={!symptoms}>Confirm Appointment</button>
              </div>
            )}
          </>
        )}

        {/* Appointments View */}
        {view === "appointments" && !apptDetail && (
          <>
            <div className="page-header"><h1>My Appointments</h1><p>Track and manage all your healthcare visits.</p></div>
            {appointments.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">📋</div><h3>No appointments yet</h3><p>Book an appointment with a doctor to get started.</p><button className="btn btn-primary" onClick={() => setView("doctors")}>Find a Doctor</button></div>
            ) : (
              <div className="appointments-list">
                {appointments.map((a) => {
                  const d = new Date(a.slotDate);
                  return (
                    <div key={a.id} className="appointment-card" onClick={() => viewDetail(a.id)} style={{ cursor: "pointer" }}>
                      <div className="appointment-card-left">
                        <div className="appointment-card-date"><div className="day">{d.getUTCDate()}</div><div className="month">{d.toLocaleString("en", { month: "short", timeZone: "UTC" })}</div></div>
                        <div className="appointment-card-info"><h4>Dr. {a.doctorProfile?.user?.firstName} {a.doctorProfile?.user?.lastName}</h4><p>{a.doctorProfile?.specialisation?.name} • {a.slotStartTime}</p></div>
                      </div>
                      <span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Appointment Detail */}
        {view === "appointments" && apptDetail && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setApptDetail(null)} style={{ marginBottom: "1rem" }}>← Back to Appointments</button>
            <div className="card" style={{ marginBottom: "1rem" }}>
              <div className="flex-between" style={{ marginBottom: "1rem" }}>
                <h2>Appointment Details</h2>
                <span className={`badge badge-${apptDetail.status.toLowerCase()}`}>{apptDetail.status}</span>
              </div>
              <div className="grid-2">
                <div><p className="text-sm text-muted">Doctor</p><p style={{ fontWeight: 600 }}>Dr. {apptDetail.doctorProfile?.user?.firstName} {apptDetail.doctorProfile?.user?.lastName}</p></div>
                <div><p className="text-sm text-muted">Specialty</p><p>{apptDetail.doctorProfile?.specialisation?.name}</p></div>
                <div><p className="text-sm text-muted">Date</p><p>{apptDetail.slotDate?.split("T")[0]}</p></div>
                <div><p className="text-sm text-muted">Time</p><p>{apptDetail.slotStartTime} - {apptDetail.slotEndTime}</p></div>
              </div>
              {apptDetail.symptomSubmission && (<div style={{ marginTop: "1rem" }}><p className="text-sm text-muted">Symptoms</p><p>{apptDetail.symptomSubmission.symptoms}</p></div>)}
            </div>
            {apptDetail.postSummary && !apptDetail.postSummary.status && !apptDetail.postSummary.isFailure && (
              <div className="ai-badge"><p><strong>What happened:</strong> {apptDetail.postSummary.patientExplanation}</p><p style={{ marginTop: "0.5rem" }}><strong>Medications:</strong> {apptDetail.postSummary.medicationSchedule}</p><p style={{ marginTop: "0.5rem" }}><strong>Next steps:</strong> {apptDetail.postSummary.followUpSteps}</p><p className="disclaimer">This summary is AI-generated and not a medical diagnosis. Always consult your doctor.</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
