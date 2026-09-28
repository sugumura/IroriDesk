import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// ダークモードは OS 設定に追従する（shadcn/ui は .dark クラスで切り替える）
const media = window.matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => document.documentElement.classList.toggle("dark", media.matches);
applyTheme();
media.addEventListener("change", applyTheme);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
