import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyInitialTheme } from "./lib/appearance";

// 設定の読み込みまでは OS のテーマに合わせる（shadcn/ui は .dark クラスで切り替える）
applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
