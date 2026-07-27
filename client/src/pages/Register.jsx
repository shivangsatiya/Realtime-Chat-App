import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(form.username, form.email, form.password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Try again.");
      setShakeKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div style={{ width: "100%", maxWidth: "26rem" }}>
        <div className="brand-mark justify-content-center mb-4 d-flex">
          <span className="pulse-dot" />
          <span>Wire</span>
        </div>

        <div key={shakeKey} className={`auth-card ${shakeKey > 0 ? "shake" : ""}`}>
          <h1 className="h4 fw-semibold mb-1">Create your account</h1>
          <p className="mb-4" style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Join the room, no waiting for a signal.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label className="form-label">Username</label>
              <input
                required
                minLength={3}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="form-control"
                placeholder="shivang_dev"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="form-control"
                placeholder="you@example.com"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="form-control"
                placeholder="At least 6 characters"
              />
            </div>

            {error && (
              <p className="mb-3" style={{ color: "var(--color-danger)", fontSize: "0.9rem" }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className="btn btn-accent w-100 py-2">
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center mt-4 mb-0" style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
