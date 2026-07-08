import { useCallback, useEffect, useState } from "react";
import { backendOptionsFrom, groupByKind, BACKENDS } from "./backends.js";

// A cross-component "re-scan backends" signal. BackendManager dispatches it
// after a key is saved/cleared so every mounted picker in the same window
// refetches (with refresh:true, which also re-scans CLIs / re-probes Ollama).
const CHANGED_EVENT = "peek:backends-changed";

export function notifyBackendsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useInstalledBackends() {
  // { available:[ids], backends:[{id,kind,vendor,label,available,models,...}] }
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchIt = (refresh) =>
      window.peekDesktop?.listBackends?.({ refresh })
        .then((res) => { if (!cancelled) setData(res || { available: [], backends: [] }); })
        .catch(() => { if (!cancelled) setData({ available: [], backends: [] }); });
    fetchIt(false);
    const onChanged = () => fetchIt(true);
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => { cancelled = true; window.removeEventListener(CHANGED_EVENT, onChanged); };
  }, []);

  const available = data?.available ?? [];
  const backends = data?.backends ?? [];

  const reload = useCallback(() => notifyBackendsChanged(), []);
  const modelsFor = useCallback((id) => {
    const live = backends.find((b) => b.id === id);
    if (live?.models?.length) return live.models;
    return BACKENDS[id]?.models || [];
  }, [backends]);

  return {
    loading: data === null,
    available,
    backends,
    options: backendOptionsFrom(available),
    groupedOptions: groupByKind(available),
    hasAny: available.length > 0,
    hasMultiple: available.length > 1,
    reload,
    modelsFor,
  };
}
