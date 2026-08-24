import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";

export default function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"overview" | "doctors" | "create" | "leave">("overview");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [docForm, setDocForm] = useState({ email: "", password: "", firstName: "", lastName: "", specialisationId: "", qualifications: "MD", bio: "", consultationDurationMin: 30 });
  const [leaveForm, setLeaveForm] = useState({ doctorId: "", startDate: "", endDate: "", reason: "" });

  useEffect(() => { loadDoctors(); loadSpecs(); }, []);
  const loadDoctors = async () => { const r = await api.get("/api/doctors", token); if (r.data) setDoctors(r.data); };
  const loadSpecs = async () => { const r = await api.get("/api/specialisations", token); if (r.data) setSpecs(r.data); };

  const createDoctor = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    const r = await api.post("/api/doctors", { ...docForm, qualifications: docForm.qualifications.split(",").map((s) => s.trim()), consultationDurationMin: Number(docForm.consultationDurationMin) }, token);
    if (r.data) { setMsg("Doctor created successfully!"); setMsgType("success"); loadDoctors(); setView("doctors"); } else { setMsg(r.error?.details?.map((d: any) => d.message).join(". ") || r.error?.message || "Failed"); setMsgType("error"); }
  };

  const createLeave = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    const r = await api.post(`/api/doctors/${leaveForm.doctorId}/leave`, { startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason }, token);
    if (r.data) { setMsg("Leave created. Affected appointments cancelled."); setMsgType("success"); } else { setMsg(r.error?.message || "Failed"); setMsgType("error"); }
  };

  const initials = user ? `${user.firstName[0]}${user.lastName[0]}` : "";

  return (
    <div className="app-layout">
      <nav className="navbar">
        <div className="navbar-brand"><div className="logo">CS</div><span>CareSync</span></div>
        <div className="navbar-nav">
          <button className={`nav-link ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")}>Overview</button>
          <button className={`nav-link ${view === "doctors" ? "active" : ""}`} onClick={() => setView("doctors")}>Doctors</button>
          <button className={`nav-link ${view === "create" ? "active" : ""}`} onClick={() => setView("create")}>Add Doctor</button>
          <button className={`nav-link ${view === "leave" ? "active" : ""}`} onClick={() => setView("leave")}>Manage Leave</button>
        </div>
        <div className="navbar-right">
          <div className="navbar-user"><div className="avatar">{initials}</div><span className="user-name">{user?.firstName}</span></div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        {msg && <div className={`alert ${msgType === "success" ? "alert-success" : "alert-error"}`}>{msg}</div>}

        {view === "overview" && (
          <>
            <div className="page-header"><h1>Admin Dashboard</h1><p>Manage doctors, specialisations, and system configuration.</p></div>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-icon blue">👨‍⚕️</div><div className="stat-content"><h3>{doctors.length}</h3><p>Total Doctors</p></div></div>
              <div className="stat-card"><div className="stat-icon green">🏥</div><div className="stat-content"><h3>{specs.length}</h3><p>Specialisations</p></div></div>
            </div>
          </>
        )}

        {view === "doctors" && (
          <>
            <div className="page-header"><h1>Doctors</h1><p>Manage all registered doctors.</p></div>
            <div className="doctors-grid">
              {doctors.map((d) => (
                <div key={d.id} className="doctor-card">
                  <div className="doctor-card-header">
                    <div className="doctor-avatar">{d.user.firstName[0]}{d.user.lastName[0]}</div>
                    <div className="doctor-info"><h3>Dr. {d.user.firstName} {d.user.lastName}</h3><p>{d.specialisation?.name}</p></div>
                  </div>
                  <div className="doctor-meta"><span>⏱ {d.consultationDurationMin} min</span><span>📋 {d.qualifications?.join(", ")}</span></div>
                  <span className={`badge ${d.user.isActive ? "badge-success" : "badge-danger"}`}>{d.user.isActive ? "Active" : "Inactive"}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {view === "create" && (
          <div className="card" style={{ maxWidth: 600 }}>
            <h2 style={{ marginBottom: "1.5rem" }}>Register New Doctor</h2>
            <form onSubmit={createDoctor}>
              <div className="grid-2">
                <div className="form-group"><label>First Name</label><input value={docForm.firstName} onChange={(e) => setDocForm({ ...docForm, firstName: e.target.value })} required /></div>
                <div className="form-group"><label>Last Name</label><input value={docForm.lastName} onChange={(e) => setDocForm({ ...docForm, lastName: e.target.value })} required /></div>
              </div>
              <div className="form-group"><label>Email</label><input value={docForm.email} onChange={(e) => setDocForm({ ...docForm, email: e.target.value })} type="email" required /></div>
              <div className="form-group"><label>Password</label><input value={docForm.password} onChange={(e) => setDocForm({ ...docForm, password: e.target.value })} type="password" required /></div>
              <div className="form-group"><label>Specialisation</label><select value={docForm.specialisationId} onChange={(e) => setDocForm({ ...docForm, specialisationId: e.target.value })} required><option value="">Select specialisation...</option>{specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="grid-2">
                <div className="form-group"><label>Qualifications</label><input value={docForm.qualifications} onChange={(e) => setDocForm({ ...docForm, qualifications: e.target.value })} placeholder="MD, MBBS" /></div>
                <div className="form-group"><label>Duration (min)</label><input type="number" value={docForm.consultationDurationMin} onChange={(e) => setDocForm({ ...docForm, consultationDurationMin: Number(e.target.value) })} /></div>
              </div>
              <button className="btn btn-primary btn-lg" style={{ marginTop: "0.5rem" }}>Create Doctor</button>
            </form>
          </div>
        )}

        {view === "leave" && (
          <div className="card" style={{ maxWidth: 600 }}>
            <h2 style={{ marginBottom: "1.5rem" }}>Doctor Leave Management</h2>
            <form onSubmit={createLeave}>
              <div className="form-group"><label>Doctor</label><select value={leaveForm.doctorId} onChange={(e) => setLeaveForm({ ...leaveForm, doctorId: e.target.value })} required><option value="">Select doctor...</option>{doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.user.firstName} {d.user.lastName}</option>)}</select></div>
              <div className="grid-2">
                <div className="form-group"><label>Start Date</label><input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} required /></div>
                <div className="form-group"><label>End Date</label><input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} required /></div>
              </div>
              <div className="form-group"><label>Reason (optional)</label><input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Personal, conference, etc." /></div>
              <button className="btn btn-primary btn-lg" style={{ marginTop: "0.5rem" }}>Create Leave</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
