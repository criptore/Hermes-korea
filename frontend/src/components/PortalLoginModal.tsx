import { useEffect, useState } from "react";
import type { ToastInput } from "../lib/toast";
import { HermesMark } from "./HermesMark";
import { Icon } from "./Icon";
import { ModaleFond, ModalePanneau } from "./Modale";

type Props = {
  onClose: () => void;
  onToast: (t: ToastInput) => void;
};

export function PortalLoginModal({ onClose, onToast }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(() => {
      onClose();
      onToast({
        title: "ARGOS",
        app: "Portal added",
        msg: `${name || "Portal"} session captured and encrypted. ARGOS will use it on the next cycle.`,
        agent: "argos",
      });
    }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Échap ferme la modale.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [onClose]);

  const steps = [
    { n: 1, label: "Identify the portal" },
    { n: 2, label: "Interactive sign-in" },
    { n: 3, label: "Session capture" },
  ];

  return (
    <ModaleFond onClick={onClose}>
      <ModalePanneau onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <button className="modal__close" onClick={onClose}>
            <Icon.close />
          </button>
          <div className="modal__eyebrow">
            <HermesMark size={14} />
            <span>HERMES · First sign-in</span>
          </div>
          <h3 className="modal__title">Add a monitored portal</h3>
          <p className="modal__sub">
            Sign in once in the Playwright window. ARGOS will keep the encrypted session
            and replay it on every cycle.
          </p>
        </div>

        <div className="modal__body">
          <div className="modal__steps">
            {steps.map((s) => (
              <div
                key={s.n}
                className={`modal__step ${
                  step === s.n
                    ? "modal__step--active"
                    : step > s.n
                      ? "modal__step--done"
                      : ""
                }`}
              >
                <div className="modal__step-num">
                  {step > s.n ? <Icon.check size={10} /> : s.n}
                </div>
                <div className="modal__step-text">{s.label}</div>
              </div>
            ))}

            <div className="modal__hint">
              <span className="modal__hint-icon">
                <Icon.warning size={12} />
              </span>
              <span>
                No password is ever stored in plain text. Only the session is
                kept.
              </span>
            </div>
          </div>

          <div className="modal__viewport">
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "var(--fg-3)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Portal name
                  </label>
                  <input
                    className="input"
                    style={{ marginTop: 6 }}
                    placeholder="e.g. Maximilien"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: "var(--fg-3)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Sign-in URL
                  </label>
                  <input
                    className="input"
                    style={{ marginTop: 6, fontFamily: "var(--font-mono)" }}
                    placeholder="https://maximilien.fr/connexion"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div
                  style={{
                    background: "var(--bg-2)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    padding: "14px 16px",
                    fontSize: 12.5,
                    color: "var(--fg-2)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <Icon.warning size={13} />
                    <span style={{ fontWeight: 500 }}>How the session works</span>
                  </div>
                  <span style={{ color: "var(--fg-3)" }}>
                    A Playwright window will open. Sign in as usual (2FA, captcha,
                    etc.). As soon as the portal's home page is visible, close the
                    window — HERMES will capture the session automatically.
                  </span>
                </div>
                <div style={{ flex: 1 }} />
              </div>
            )}

            {step === 2 && (
              <>
                <div className="browser-mock">
                  <div className="browser-mock__bar">
                    <div className="browser-mock__dots">
                      <span className="browser-mock__dot" />
                      <span className="browser-mock__dot" />
                      <span className="browser-mock__dot" />
                    </div>
                    <div className="browser-mock__url">
                      {url || "https://maximilien.fr/connexion"}
                    </div>
                  </div>
                  <div className="browser-mock__content">
                    <h3>Sign in to {name || "Maximilien"}</h3>
                    <div className="browser-mock__form">
                      <div className="browser-mock__field">
                        <label>Username</label>
                        <input type="text" defaultValue="demo-user" />
                      </div>
                      <div className="browser-mock__field">
                        <label>Password</label>
                        <input type="password" defaultValue="••••••••••••" />
                      </div>
                      <button className="browser-mock__submit">Sign in</button>
                    </div>
                  </div>
                </div>
                <div className="modal__hint" style={{ marginTop: 14 }}>
                  <span className="modal__hint-icon">
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "var(--gold)",
                        boxShadow: "0 0 8px var(--gold-glow)",
                      }}
                    />
                  </span>
                  <span>
                    Playwright window open — sign in, then come back here.
                  </span>
                </div>
              </>
            )}

            {step === 3 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  gap: 16,
                  padding: "40px 0",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    border: "2px solid rgba(29,158,117,0.20)",
                    borderTopColor: "var(--argos)",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  Capturing the session…
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-3)" }}>
                  AES-256 encryption, then secure local storage.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal__foot">
          <div className="modal__foot-state">
            <span>
              Step <strong style={{ color: "var(--fg)" }}>{step}</strong> / 3
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && step < 3 && (
              <button
                className="btn btn--ghost"
                onClick={() => setStep((step - 1) as 1 | 2)}
              >
                Back
              </button>
            )}
            {step < 2 && (
              <button
                className="btn btn--gold"
                onClick={() => setStep(2)}
                disabled={!name || !url}
              >
                Open Playwright
              </button>
            )}
            {step === 2 && (
              <button className="btn btn--gold" onClick={() => setStep(3)}>
                I have finished signing in
              </button>
            )}
          </div>
        </div>
      </ModalePanneau>
    </ModaleFond>
  );
}
