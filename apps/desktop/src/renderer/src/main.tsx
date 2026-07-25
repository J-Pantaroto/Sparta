import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// Ordem importa: tokens definem as variaveis, base as consome. O CSS de
// cada componente vem do proprio modulo, importado por ele.
import "./ui/tokens.css";
import "./ui/base.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
