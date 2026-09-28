import { useEffect } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useStore } from "./store";
import { layoutStorage } from "./lib/layoutStorage";
import { CollectionTree } from "./components/CollectionTree";
import { DocumentDetail } from "./components/DocumentDetail";
import { TabsArea } from "./components/TabsArea";
import { TopBar } from "./components/TopBar";
import { TooltipProvider } from "./components/ui/tooltip";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";

function MainPanes({ detailOpen }: { detailOpen: boolean }) {
  // 詳細ペインの開閉ごとにレイアウトを別々に保存・復元する
  const panelIds = detailOpen ? ["tree", "main", "detail"] : ["tree", "main"];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "main-layout",
    panelIds,
    storage: layoutStorage,
  });
  return (
    <ResizablePanelGroup
      key={panelIds.join()}
      id="main-layout"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="min-h-0 flex-1"
    >
      <ResizablePanel id="tree" defaultSize={240} minSize={160} maxSize="40">
        <CollectionTree />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="main" minSize={320}>
        <TabsArea />
      </ResizablePanel>
      {detailOpen && (
        <>
          <ResizableHandle />
          <ResizablePanel id="detail" defaultSize={420} minSize={260} maxSize="60">
            <DocumentDetail />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

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
          <MainPanes detailOpen={detailOpen} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            左上の接続の管理ボタンから接続を追加してください
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default App;
