import { useEffect } from "react";
import PillDropdown from "./PillDropdown.jsx";
import { BACKENDS } from "./backends.js";
import { useInstalledBackends } from "./useInstalledBackends.js";

// Chooses a model within the selected backend. Controlled by the parent (which
// owns the value so it can thread it into ask()). Hidden when the backend
// exposes one or zero models (CLIs, single-model Ollama). For API backends the
// list is static from the registry; for Ollama it's the live /api/tags list.
export default function ModelPicker({ backendId, value, onChange, placement = "up", align = "left" }) {
  const { modelsFor } = useInstalledBackends();
  const models = modelsFor(backendId);

  // Once models are known, pick a sensible default if none is chosen yet.
  useEffect(() => {
    if (value || !models.length) return;
    const def = BACKENDS[backendId]?.defaultModel;
    onChange(def && models.includes(def) ? def : models[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models, value, backendId]);

  if (models.length <= 1) return null;

  return (
    <PillDropdown
      value={value}
      onChange={onChange}
      options={models.map((m) => ({ value: m, label: m }))}
      placement={placement}
      align={align}
      minWidth={120}
    />
  );
}
