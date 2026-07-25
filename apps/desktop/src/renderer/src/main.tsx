import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// Ordem importa: tokens definem as variaveis, base as consome, e o
// global.css (restos ainda nao migrados pro design system) vem por ultimo.
import "./ui/tokens.css";
import "./ui/base.css";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
