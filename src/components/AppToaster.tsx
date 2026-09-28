import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useStore } from "@/store";

/** 通知の表示場所。テーマはアプリの設定（システム / ライト / ダーク）に合わせる */
export function AppToaster() {
  const theme = useStore((s) => s.appearance.theme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const resolved = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  return <Toaster theme={resolved} position="bottom-right" richColors closeButton={false} visibleToasts={4} />;
}
