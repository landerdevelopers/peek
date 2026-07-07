import { useEffect, useState } from "react";
import { backendOptionsFrom } from "./backends.js";

export function useInstalledBackends() {
  const [available, setAvailable] = useState(null);

  useEffect(() => {
    let cancelled = false;
    window.peekDesktop?.listBackends?.()
      .then((res) => {
        if (!cancelled) setAvailable(res?.available || []);
      })
      .catch(() => {
        if (!cancelled) setAvailable([]);
      });
    return () => { cancelled = true; };
  }, []);

  const list = available ?? [];
  return {
    loading: available === null,
    available: list,
    options: backendOptionsFrom(list),
    hasAny: list.length > 0,
    hasMultiple: list.length > 1,
  };
}
