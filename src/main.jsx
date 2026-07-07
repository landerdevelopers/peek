import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Dashboard from "./Dashboard.jsx";

// Two windows share this same entry (see electron/main.cjs): the hotkey
// overlay loads with no hash, the main app window loads with #/dashboard.
// Each window is permanently one or the other, so a one-time check at
// startup is enough — no need to react to hash changes at runtime.
const isDashboard = window.location.hash.startsWith("#/dashboard");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isDashboard ? <Dashboard /> : <App />}
  </React.StrictMode>
);
