import { useEffect } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { useStore } from "./store";
import { useT } from "./i18n";
import { layoutStorage } from "./lib/layoutStorage";
import { CollectionTree } from "./components/CollectionTree";
import { DetailPane } from "./components/DetailPane";
import { TabsArea } from "./components/TabsArea";
import { TopBar } from "./components/TopBar";
import { GlobalTooltip } from "./components/GlobalTooltip";
import { AppToaster } from "./components/AppToaster";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/ui/resizable";

function MainPanes({ treeOpen, detailOpen }: { treeOpen: boolean; detailOpen: boolean }) {
  // 左右のペインの開閉の組み合わせごとにレイアウトを別々に保存・復元する
  const panelIds = [...(treeOpen ? ["tree"] : []), "main", ...(detailOpen ? ["detail"] : [])];
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
      {treeOpen && (
        <>
          <ResizablePanel id="tree" defaultSize={240} minSize={160} maxSize="40">
            <CollectionTree />
          </ResizablePanel>
          <ResizableHandle />
        </>
      )}
      <ResizablePanel id="main" minSize={320}>
        <TabsArea />
      </ResizablePanel>
      {detailOpen && (
        <>
          <ResizableHandle />
          <ResizablePanel id="detail" defaultSize={420} minSize={260} maxSize="60">
            <DetailPane />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

function App() {
  const t = useT();
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const hasConnection = useStore((s) => s.activeConnectionId !== null);
  const detailOpen = useStore((s) => s.detailOpen);
  const treeOpen = useStore((s) => s.treeOpen);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return null;

  return (
    <>
      <GlobalTooltip />
      <AppToaster />
      <div className="flex h-full flex-col">
        <TopBar />
        {hasConnection ? (
          <MainPanes treeOpen={treeOpen} detailOpen={detailOpen} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            {t("topbar.noConnection")}
          </div>
        )}
      </div>
    </>
  );
}

export default App;
