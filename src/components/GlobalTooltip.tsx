import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 400;
const GAP = 6;
const MARGIN = 8;

interface Tip {
  text: string;
  /** 対象要素の位置（ビューポート座標） */
  rect: DOMRect;
}

/**
 * title 属性のツールチップをアプリの見た目で表示する。
 * macOS の WKWebView は title のツールチップをほとんど表示しないため、
 * title を data-tooltip に移し替えて自前で描画する（各コンポーネントは title を付けるだけでよい）
 */
export function GlobalTooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    let current: HTMLElement | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[title], [data-tooltip]");
      if (el === current) return;
      hide();
      if (!el) return;
      // 標準のツールチップを止めるため title を移し替える（React が title を変えれば次回また移る）
      const title = el.getAttribute("title");
      if (title !== null) {
        el.setAttribute("data-tooltip", title);
        el.removeAttribute("title");
        // アイコンだけのボタンなどに読み上げ用の名前を付ける
        if (!el.hasAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", title);
      }
      const text = el.getAttribute("data-tooltip");
      if (!text) return;
      current = el;
      timer = window.setTimeout(() => {
        if (current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, DELAY_MS);
    };

    const onOut = (e: PointerEvent) => {
      const to = e.relatedTarget as Node | null;
      if (current && to && current.contains(to)) return;
      hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    // クリック・キー入力・スクロールで閉じる
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // 描画後の大きさを測って、要素の下（入らなければ上）に画面内に収めて置く
  useEffect(() => {
    if (!tip || !boxRef.current) {
      setPos(null);
      return;
    }
    const box = boxRef.current.getBoundingClientRect();
    const { rect } = tip;
    let top = rect.bottom + GAP;
    if (top + box.height > window.innerHeight - MARGIN) top = rect.top - GAP - box.height;
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - box.width - MARGIN));
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={boxRef}
      role="tooltip"
      className="pointer-events-none fixed z-[100] max-w-80 rounded-md bg-foreground px-2 py-1 text-xs leading-snug break-words whitespace-pre-line text-background shadow-md"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
