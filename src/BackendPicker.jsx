import PillDropdown from "./PillDropdown.jsx";
import { useInstalledBackends } from "./useInstalledBackends.js";
import { INSTALL_CLI_HINT, INSTALL_CLI_MESSAGE, labelFor } from "./backends.js";

const hintStyle = {
  fontSize: 12,
  fontWeight: 500,
  color: "#C4522F",
  lineHeight: 1.35,
  maxWidth: 280,
};

const pillLabelStyle = {
  display: "flex",
  alignItems: "center",
  height: 34,
  padding: "0 12px",
  borderRadius: 999,
  background: "linear-gradient(180deg, #fff 7%, rgba(255,255,255,0) 66%), #F2F2F2",
  boxShadow: "0 6px 10px -4px rgba(0,0,0,0.12), 0 0 0 1px #EEE",
  color: "#3A3833",
  fontSize: 12.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

// `onManage` (optional) makes the picker a gateway to the provider modal — a
// footer action in the dropdown, and a clickable prompt when nothing's set up
// yet. Without it (e.g. Settings' "Default backend" row) the picker behaves
// exactly as before: a single pill or the install hint.
export default function BackendPicker({
  value,
  onChange,
  placement = "up",
  align = "left",
  minWidth = 130,
  compact = false,
  onManage,
}) {
  const { loading, options, groupedOptions, hasAny, hasMultiple } = useInstalledBackends();

  if (loading) {
    return <span style={{ ...pillLabelStyle, color: "#96938D" }}>Checking backends…</span>;
  }

  if (!hasAny) {
    if (onManage) {
      return (
        <button
          className="peek-interactive"
          onClick={onManage}
          style={{ ...pillLabelStyle, color: "#7C3AED", cursor: "pointer", border: "none" }}
          title={INSTALL_CLI_HINT}
        >+ Add an AI backend</button>
      );
    }
    if (compact) {
      return <span style={hintStyle} title={INSTALL_CLI_HINT}>No backend yet</span>;
    }
    return (
      <div style={hintStyle}>
        <div>{INSTALL_CLI_MESSAGE}</div>
        <div style={{ marginTop: 4, color: "#96938D", fontSize: 11.5 }}>{INSTALL_CLI_HINT}</div>
      </div>
    );
  }

  // Single backend and no manage affordance → the old static pill.
  if (!hasMultiple && !onManage) {
    return <span style={pillLabelStyle}>{labelFor(value) || options[0].label}</span>;
  }

  return (
    <PillDropdown
      value={value}
      onChange={onChange}
      options={hasMultiple ? groupedOptions : options}
      placement={placement}
      align={align}
      minWidth={minWidth}
      onManage={onManage}
    />
  );
}
