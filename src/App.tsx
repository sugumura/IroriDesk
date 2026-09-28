import { useEffect } from "react";
import { useStore } from "./store";
import { CollectionTree } from "./components/CollectionTree";
import { DocumentDetail } from "./components/DocumentDetail";
import { TabsArea } from "./components/TabsArea";
import { TopBar } from "./components/TopBar";
import { TooltipProvider } from "./components/ui/tooltip";

function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const hasConnection = useStore((s) => s.activeConnectionId !== null);
  const detailOpen = useStore((s) => s.detailOpen);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return null;

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        {hasConnection ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-60 shrink-0 border-r">
              <CollectionTree />
            </aside>
            <main className="min-w-0 flex-1">
              <TabsArea />
            </main>
            {detailOpen && (
              <aside className="w-[420px] shrink-0 border-l">
                <DocumentDetail />
              </aside>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            上部の歯車ボタンから接続を追加してください
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
