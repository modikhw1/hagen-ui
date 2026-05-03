import { useState } from "react";

const BROWN = "#4A2F18";
const CREAM = "#FAF8F5";

const SCOPE_OPTIONS = [
  { id: "medverka", label: "Medverka i video", sub: null },
  { id: "skriva", label: "Skriva sketch / manus", sub: null },
  { id: "producera", label: "Producera / regissera", sub: null },
  { id: "skriva_medverka", label: "Skriva + medverka", sub: "LeTrend hanterar klippning & editering" },
];

function ScopeCheck({ checked }) {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: 4,
      border: `1.5px solid ${checked ? BROWN : "rgba(74,47,24,0.25)"}`,
      background: checked ? BROWN : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, transition: "all 0.15s",
    }}>
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6">
          <polyline points="1,3 3,5 7,1" stroke="#FAF8F5" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function CollabCard({ name, initials, avatarGradient, reach, scope, date, price, confirmed, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 158, aspectRatio: "9 / 16",
        borderRadius: 14,
        border: `1.5px solid ${BROWN}`,
        background: hovered ? "rgba(74,47,24,0.02)" : "#fff",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        padding: "11px 10px 10px", position: "relative",
        cursor: "pointer", transition: "all 0.15s", overflow: "hidden",
      }}
    >
      {/* Diagonal pattern */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 13,
        backgroundImage: "repeating-linear-gradient(-45deg, rgba(74,47,24,0.025) 0px, rgba(74,47,24,0.025) 1px, transparent 1px, transparent 8px)",
      }} />

      {/* Menu */}
      <div style={{
        position: "absolute", top: 9, right: 9,
        display: "flex", flexDirection: "column", gap: 2.5,
        opacity: hovered ? 1 : 0, transition: "opacity 0.15s", cursor: "pointer",
      }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "#9CA3AF" }} />)}
      </div>

      {/* Top */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, position: "relative" }}>
        <div style={{
          alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 4,
          background: BROWN, color: CREAM,
          fontSize: 8.5, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase",
          padding: "3px 7px", borderRadius: 5,
        }}>
          <span>✦</span> Samarbete
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: avatarGradient,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: CREAM, flexShrink: 0,
            border: "1.5px solid rgba(74,47,24,0.15)",
          }}>
            {initials}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: BROWN, lineHeight: 1.2 }}>{name}</div>
            <div style={{ fontSize: 9, color: "#9CA3AF", lineHeight: 1 }}>{reach} följare</div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {SCOPE_OPTIONS.filter(o => scope.includes(o.id)).map(o => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: "#6B7280" }}>
              <div style={{
                width: 11, height: 11, borderRadius: 3,
                border: `1.5px solid ${BROWN}`, background: BROWN,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="7" height="5" viewBox="0 0 7 5">
                  <polyline points="1,2.5 2.8,4.2 6,1" stroke="#FAF8F5" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {o.label}
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: "rgba(74,47,24,0.08)", margin: "1px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{
            fontSize: confirmed ? 11.5 : 10.5,
            fontWeight: 500,
            color: confirmed ? BROWN : "#9CA3AF",
            fontStyle: confirmed ? "normal" : "italic",
          }}>
            {date}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: price ? BROWN : "#9CA3AF" }}>
            {price ? `${price} kr` : "—"}
          </div>
        </div>

        <div style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          borderRadius: 4, padding: "2px 5px",
          background: confirmed ? "rgba(16,185,129,0.1)" : "rgba(74,47,24,0.07)",
          fontSize: 8.5, fontWeight: 600, letterSpacing: "0.04em",
          color: confirmed ? "#0a6644" : "#9CA3AF",
          alignSelf: "flex-start",
        }}>
          <div style={{
            width: 4, height: 4, borderRadius: "50%",
            background: confirmed ? "#10B981" : "#C4B5A0",
          }} />
          {confirmed ? "Bekräftat" : "Ej bekräftat"}
        </div>
      </div>
    </div>
  );
}

function Modal({ onClose, onSave }) {
  const [scope, setScope] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [reach, setReach] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [dateType, setDateType] = useState("exact");
  const [date, setDate] = useState("");

  const toggleScope = (id) => {
    setScope(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(20,12,6,0.45)",
        zIndex: 100, display: "flex",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 16,
        width: 340, maxHeight: "90vh", overflowY: "auto",
        padding: 20, display: "flex", flexDirection: "column", gap: 16,
        boxShadow: "0 8px 32px rgba(20,12,6,0.18)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BROWN, display: "flex", alignItems: "center", gap: 6 }}>
            ✦ Nytt samarbete
          </div>
          <button onClick={onClose} style={{
            width: 26, height: 26, borderRadius: "50%",
            border: "1px solid rgba(74,47,24,0.15)", background: "none",
            cursor: "pointer", fontSize: 14, color: "#9CA3AF",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Profile */}
        <Section label="Profil">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 54, height: 54, borderRadius: "50%",
              border: "1.5px dashed rgba(74,47,24,0.25)",
              background: CREAM, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 18, flexShrink: 0,
            }}>＋</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Namn" />
              <Input value={reach} onChange={e => setReach(e.target.value)} placeholder="Följare (t.ex. 42k)" />
            </div>
          </div>
        </Section>

        {/* Scope */}
        <Section label="Scope">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SCOPE_OPTIONS.map(o => (
              <div key={o.id}
                onClick={() => toggleScope(o.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 8,
                  border: `1.5px solid ${scope.includes(o.id) ? BROWN : "rgba(74,47,24,0.1)"}`,
                  background: scope.includes(o.id) ? "rgba(74,47,24,0.04)" : "transparent",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <ScopeCheck checked={scope.includes(o.id)} />
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: BROWN }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 9.5, color: "#9CA3AF" }}>{o.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Datum */}
        <Section label="Datum">
          <div style={{ display: "flex", gap: 8 }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ flex: 1, ...inputStyle }} />
            <select value={dateType} onChange={e => setDateType(e.target.value)}
              style={{ flex: 1, ...inputStyle, cursor: "pointer" }}>
              <option value="exact">Exakt datum</option>
              <option value="projected">Projicerat tempo</option>
            </select>
          </div>
        </Section>

        {/* Pris */}
        <Section label="Pris">
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>kr</span>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)}
              placeholder="0" style={{ ...inputStyle, width: "100%", paddingLeft: 26 }} />
          </div>
        </Section>

        {/* Status */}
        <Section label="Status">
          <div style={{ display: "flex", gap: 8 }}>
            {["Ej bekräftat", "Bekräftat"].map((label, i) => (
              <div key={i} onClick={() => setConfirmed(i === 1)}
                style={{
                  flex: 1, padding: 7, borderRadius: 8, textAlign: "center",
                  fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                  border: `1.5px solid ${(i === 1) === confirmed ? BROWN : "rgba(74,47,24,0.1)"}`,
                  background: (i === 1) === confirmed ? BROWN : "transparent",
                  color: (i === 1) === confirmed ? CREAM : "#9CA3AF",
                }}>
                {label}
              </div>
            ))}
          </div>
        </Section>

        {/* Notering */}
        <Section label="Notering">
          <textarea value={note} onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="T.ex. överenskommet via mail 12 feb, profilen tar kontakt om logistik..."
            style={{ ...inputStyle, width: "100%", resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
          />
        </Section>

        <button onClick={onClose} style={{
          width: "100%", padding: 10, borderRadius: 9,
          background: BROWN, color: CREAM, border: "none",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600,
          cursor: "pointer",
        }}>
          Spara samarbete
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9CA3AF" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ ...inputStyle, width: "100%" }} />
  );
}

const inputStyle = {
  padding: "8px 10px", borderRadius: 8,
  border: "1.5px solid rgba(74,47,24,0.12)",
  fontFamily: "inherit", fontSize: 12, color: BROWN,
  background: CREAM, outline: "none", boxSizing: "border-box",
};

export default function CollaborationCard() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div style={{
      padding: "2rem 1.5rem", fontFamily: "'DM Sans', system-ui, sans-serif",
      display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap",
      background: CREAM, minHeight: "100vh",
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF" }}>
          Samarbete — bekräftat
        </div>
        <CollabCard
          name="Johan Lindén" initials="JL" reach="42k"
          avatarGradient="linear-gradient(135deg, #c4813a, #7a3f18)"
          scope={["skriva", "medverka"]}
          date="28 feb" price="3 500" confirmed
          onClick={() => setModalOpen(true)}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9CA3AF" }}>
          Samarbete — ej bekräftat
        </div>
        <CollabCard
          name="Sara Åkvist" initials="SA" reach="18k"
          avatarGradient="linear-gradient(135deg, #a0a0b0, #606070)"
          scope={["medverka"]}
          date="~15 mar" price="" confirmed={false}
          onClick={() => setModalOpen(true)}
        />
      </div>

      {modalOpen && <Modal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
