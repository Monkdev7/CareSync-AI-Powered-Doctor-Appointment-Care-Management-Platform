import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../api";

export default function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"doctors" | "create" | "leave">("doctors");
  const [doctors, setDoctors] = useState<any[]>([]);
  const [specs, setSpecs] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [docForm, setDocForm] = useState({ email: "", password: "", firstName: "", lastName: "", specialisationId: "", qualifications: "MD", bio: "", consultationDurationMin: 30 });
  const [leaveForm, setLeaveForm] = useState({ doctorId: "", startDate: "", endDate: "", reason: "" });

  useEffect(() => { loadDoctors(); loadSpecs(); }, []);

  const loadDoctors = async () => { const r = await api.get("/api/doctors", token); if (r.data) setDoctors(r.data); };
  const loadSpecs = async () => { const r = await api.get("/api/specialisations", token); if (r.data) setSpecs(r.data); };

  const createDoctor = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    const r = await api.post("/api/doctors", { ...docForm, qualifications: docForm.qualifications.split(",").map((s) => s.trim()), consultationDurationMin: Number(docForm.consultationDurationMin) }, token);
    if (r.data) { setMsg("Doctor created!"); loadDoctors(); setView("doctors"); } else setMsg(r.error?.message || "Failed");
  };

  const createLeave = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    const r = await api.post(`/api/doctors/${leaveForm.doctorId}/leave`, { startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason }, token);
    if (r.data) setMsg("Leave created! Affected appointments cancelled."); else setMsg(r.error?.message || "Failed");
  };

  return (
    <div>
      <nav><span>⚙️ Admin Portal — {user?.firstName}</span><div><button className="btn btn-sm" onClick={() => setView("doctors")}>Doctors</button> <button className="btn btn-sm" onClick={() => setView("create")}>Add Doctor</button> <button className="btn btn-sm" onClick={() => setView("leave")}>Leave</button> <button className="btn btn-sm btn-danger" onClick={logout}>Logout</button></div></nav>
      <div className="container">
        {msg && <p className={msg.includes("!") ? "success" : "error"}>{msg}</p>}
        {view === "doctors" && (<><h2>Doctors</h2>{doctors.map((d) => (
          <div key={d.id} className="card"><strong>Dr. {d.user.firstName} {d.user.lastName}</strong> — {d.specialisation?.name}<br/><small>{d.qualifications?.join(", ")} • {d.consultationDurationMin}min</small></div>
        ))}</>)}
        {view === "create" && (<div className="card"><h2>Create Doctor</h2><form onSubmit={createDoctor}>
          <label>Email</label><input value={docForm.email} onChange={(e) => setDocForm({ ...docForm, email: e.target.value })} type="email" required />
          <label>Password</label><input value={docForm.password} onChange={(e) => setDocForm({ ...docForm, password: e.target.value })} type="password" required />
          <label>First Name</label><input value={docForm.firstName} onChange={(e) => setDocForm({ ...docForm, firstName: e.target.value })} required />
          <label>Last Name</label><input value={docForm.lastName} onChange={(e) => setDocForm({ ...docForm, lastName: e.target.value })} required />
          <label>Specialisation</label><select value={docForm.specialisationId} onChange={(e) => setDocForm({ ...docForm, specialisationId: e.target.value })} required><option value="">Select...</option>{specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <label>Qualifications (comma-separated)</label><input value={docForm.qualifications} onChange={(e) => setDocForm({ ...docForm, qualifications: e.target.value })} />
          <label>Consultation Duration (min)</label><input type="number" value={docForm.consultationDurationMin} onChange={(e) => setDocForm({ ...docForm, consultationDurationMin: Number(e.target.value) })} />
          <button className="btn btn-primary">Create Doctor</button>
        </form></div>)}
        {view === "leave" && (<div className="card"><h2>Doctor Leave</h2><form onSubmit={createLeave}>
          <label>Doctor</label><select value={leaveForm.doctorId} onChange={(e) => setLeaveForm({ ...leaveForm, doctorId: e.target.value })} required><option value="">Select...</option>{doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.user.lastName}</option>)}</select>
          <label>Start Date</label><input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} required />
          <label>End Date</label><input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} required />
          <label>Reason</label><input value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          <button className="btn btn-primary">Create Leave</button>
        </form></div>)}
      </div>
    </div>
  );
}
