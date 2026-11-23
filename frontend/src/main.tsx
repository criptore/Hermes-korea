import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { prechargerProfilLocal } from "./lib/profilDemo";
import "./index.css";

// Avant le premier rendu : App lit le profil local à l'initialisation.
prechargerProfilLocal();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
