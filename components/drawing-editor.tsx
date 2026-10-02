'use client';
import { useEffect, useMemo, useRef } from 'react';
import { Excalidraw, MainMenu, WelcomeScreen, convertToExcalidrawElements, CaptureUpdateAction, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { templateSkeleton, type TemplateId } from '@/lib/templates';
export type Scene = { elements: any[]; appState: any; files: any; libraryItems?: any[] };
export type EditorHandle = {
  snapshot: () => Scene;
  export: (format: string, scale: number, transparent: boolean, selected: boolean) => Promise<Blob>;
  addNote: () => void; fit: () => void; selectionCount: () => number;
};
export function makeScene(id: TemplateId): Scene {
  return { elements: convertToExcalidrawElements(templateSkeleton(id)), appState: { viewBackgroundColor: '#f8fafc', currentItemFontFamily: 5 }, files: {}, libraryItems: [] };
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function cleanedState(state: any) {
  return { viewBackgroundColor: state.viewBackgroundColor, scrollX: state.scrollX, scrollY: state.scrollY,
    zoom: state.zoom, gridSize: state.gridSize, currentItemFontFamily: state.currentItemFontFamily ?? 5,
    currentItemStrokeColor: state.currentItemStrokeColor, currentItemBackgroundColor: state.currentItemBackgroundColor,
    currentItemFillStyle: state.currentItemFillStyle, currentItemRoughness: state.currentItemRoughness,
    currentItemStrokeWidth: state.currentItemStrokeWidth, exportBackground: true };
}
export default function DrawingEditor({ initial, title, dark, grid, presenting, onChange, onReady, onCount }: {
  initial: Scene; title: string; dark: boolean; grid: boolean; presenting: boolean;
  onChange: (scene: Scene) => void; onReady: (handle: EditorHandle) => void; onCount: (n: number) => void;
}) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null);
  const library = useRef<any[]>(initial.libraryItems ?? []);
  const callback = useRef(onChange); callback.current = onChange;
  const countCallback = useRef(onCount); countCallback.current = onCount;
  const lastSignature = useRef('');
  const data = useMemo(() => ({ ...initial, appState: { ...initial.appState, collaborators: new Map(), currentItemFontFamily: initial.appState?.currentItemFontFamily ?? 5 }, scrollToContent: true }), [initial]);
  const snapshot = (): Scene => ({ elements: [...(api.current?.getSceneElementsIncludingDeleted() ?? [])], appState: cleanedState(api.current?.getAppState() ?? {}), files: api.current?.getFiles() ?? {}, libraryItems: library.current });
  useEffect(() => { if (presenting) api.current?.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85, animate: true }); }, [presenting]);
  return <div className="drawing-surface" aria-label="Drawing canvas">
    <Excalidraw name={title} theme={dark ? 'dark' : 'light'} gridModeEnabled={grid} viewModeEnabled={presenting} zenModeEnabled={presenting}
      initialData={data} autoFocus={false} handleKeyboardGlobally={false}
      UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: true, export: { saveFileToDisk: true }, toggleTheme: false } }}
      excalidrawAPI={instance => {
        api.current = instance;
        onReady({ snapshot, selectionCount: () => Object.keys(instance.getAppState().selectedElementIds).length,
          fit: () => instance.scrollToContent(undefined, { fitToViewport: true, viewportZoomFactor: 0.85, animate: true }),
          addNote: () => {
            const s = instance.getAppState(); const z = s.zoom.value;
            const note = convertToExcalidrawElements([{ type: 'rectangle', x: -s.scrollX + s.width / z / 2 - 95, y: -s.scrollY + s.height / z / 2 - 85, width: 190, height: 170, strokeWidth: 1, strokeColor: '#ccae58', backgroundColor: '#fff0b6', fillStyle: 'solid', roughness: 1, label: { text: 'A little thought…', fontSize: 23, fontFamily: 5 } }]);
            instance.updateScene({ elements: [...instance.getSceneElements(), ...note], appState: { selectedElementIds: Object.fromEntries(note.map(e => [e.id, true])) }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
          },
          export: async (format, scale, transparent, selected) => {
            const state = instance.getAppState(); const scene = snapshot();
            const elements = selected ? scene.elements.filter(e => state.selectedElementIds[e.id] || (e.containerId && state.selectedElementIds[e.containerId])) : scene.elements;
            if (format === 'excalidraw') return new Blob([serializeAsJSON(scene.elements, state, scene.files, 'local')], { type: 'application/json' });
            if (!elements.some(e => !e.isDeleted)) throw new Error('Add something to the canvas first.');
            const options = { elements, appState: { ...state, exportBackground: !transparent, exportWithDarkMode: dark, exportScale: scale }, files: scene.files, exportPadding: 35 };
            if (format === 'svg') {
              const svg = await exportToSvg(options); return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
            }
            return await exportToBlob({ ...options, mimeType: 'image/png', getDimensions: (w: number, h: number) => ({ width: w * scale, height: h * scale, scale }) });
          },
        });
      }}
      onChange={(elements, state, files) => {
        const signature = elements.map(e => `${e.id}:${e.version}:${e.isDeleted}`).join('|') + state.viewBackgroundColor;
        if (signature === lastSignature.current) return;
        const first = !lastSignature.current; lastSignature.current = signature;
        countCallback.current(elements.filter(e => !e.isDeleted).length);
        if (!first) callback.current({ elements: [...elements], appState: cleanedState(state), files, libraryItems: library.current });
      }}
      onLibraryChange={items => { const changed = JSON.stringify(library.current) !== JSON.stringify(items); library.current = [...items]; if (changed && api.current) callback.current(snapshot()); }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Export />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Logo><span className="empty-canvas-mark">✳</span></WelcomeScreen.Center.Logo>
          <WelcomeScreen.Center.Heading>A little room for big ideas.</WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu><div className="canvas-empty-tip">Pick a tool above, or press <kbd>P</kbd> and start scribbling.</div></WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
        <WelcomeScreen.Hints.ToolbarHint>Pick a tool. Follow your curiosity.</WelcomeScreen.Hints.ToolbarHint>
      </WelcomeScreen>
    </Excalidraw>
  </div>;
}
