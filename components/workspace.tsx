'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Search, LayoutTemplate, Upload, PanelLeft, Star, Ellipsis, Download, Copy, Trash2, Presentation, CloudCheck, CloudUpload, CloudOff, Loader2, Sun, Moon, Keyboard, LockKeyhole, Pencil, StickyNote, Maximize, Grid2X2, PencilRuler, ShieldCheck, ChevronDown } from 'lucide-react';
import { Sidebar, SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Toaster, toast } from 'sonner';
import { templates, type TemplateId } from '@/lib/templates';
import type { EditorHandle, Scene } from './drawing-editor';
const DrawingEditor = dynamic(() => import('./drawing-editor'), { ssr: false, loading: () => <div className="loading-state"><Loader2 className="spin" /><span>Opening your canvas…</span></div> });
type Board = { id: string; title: string; favorite: number; color: string; revision: number; updatedAt: string; createdAt: string };
async function request(url: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.');
  return data;
}
async function drawingModule() {
  (window as any).EXCALIDRAW_ASSET_PATH = '/excalidraw/';
  await document.fonts.load('20px Excalifont', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789…');
  return import('./drawing-editor');
}
function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side="bottom">{label}</TooltipContent></Tooltip>;
}
function TemplatePreview({ id }: { id: TemplateId }) {
  const rect = (x: number, y: number, w: number, h: number, color: string, key: string) => <rect key={key} x={x} y={y} width={w} height={h} rx="3" fill={color} stroke="#546172" strokeWidth="1" />;
  return <svg viewBox="0 0 240 140" aria-hidden="true">
    <defs><pattern id={`dots-${id}`} width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#dfe5ed" /></pattern></defs>
    <rect width="240" height="140" fill={`url(#dots-${id})`} />
    {id === 'blank' ? <g stroke="#98a2b3" strokeWidth="1.5"><rect x="92" y="40" width="56" height="60" rx="5" fill="#fff" strokeDasharray="4 4" /><path d="M120 58v24m-12-12h24" /></g> : id === 'mindmap' ? <g><path d="M110 70 55 35M130 70l55-35M110 75l-55 30m75-30 55 30" stroke="#8290a3" fill="none" />{rect(89,54,62,34,'#ffe29a','c')}{rect(20,23,60,26,'#f7d8d3','a')}{rect(163,23,60,26,'#cfe6f6','b')}{rect(20,94,60,26,'#d7e8d2','d')}{rect(163,94,60,26,'#e0d9f4','e')}</g> : id === 'flowchart' ? <g><path d="M47 68h34m38 0h35m27 0h28M169 84v30H98V83" stroke="#8290a3" fill="none" />{rect(11,56,38,24,'#d7e8d2','a')}{rect(81,53,43,31,'#cfe6f6','b')}<path d="m166 45 22 24-22 24-22-24Z" fill="#ffe29a" stroke="#546172"/>{rect(202,56,30,24,'#d7e8d2','c')}</g> : id === 'architecture' ? <g><path d="M68 37 104 69 69 111m70-40 35-32m-35 35 35 36m25-56v40" stroke="#8290a3" fill="none"/>{rect(15,25,55,27,'#cfe6f6','a')}{rect(15,94,55,27,'#cfe6f6','b')}{rect(92,55,56,34,'#e0d9f4','c')}{rect(174,25,54,29,'#ffe29a','d')}{rect(174,95,54,29,'#d7e8d2','e')}</g> : id === 'kanban' ? <g>{[0,1,2].map(i => <g key={i}>{rect(17+i*72,19,61,104,['#eef1f6','#fff6d8','#eaf3e9'][i],`col${i}`)}<path d={`M${28+i*72} 31h30`} stroke="#8993a3" strokeWidth="2"/>{rect(24+i*72,43,47,25,['#cfe6f6','#ffe29a','#d7e8d2'][i],`n${i}`)}{i===0 && rect(24,77,47,25,'#e0d9f4','n3')}</g>)}</g> : <g>{[0,1,2,3,4].map(i=><g key={i}>{rect(14+i*43,26,37,87,['#fff0be','#dceafb','#e9e0f8','#dfeede','#f8e0dc'][i],`d${i}`)}<path d={`M${22+i*43} 39h20`} stroke="#8e98a8"/>{i<3 && <rect x={20+i*43} y={51+i*8} width="25" height="25" rx="2" fill="#fff" opacity=".8"/>}</g>)}</g>}
  </svg>;
}
function SidebarToggle() { const { toggleSidebar } = useSidebar(); return <button className="icon-btn mobile-trigger" aria-label="Open boards" onClick={toggleSidebar}><PanelLeft /></button>; }
function CloseSidebarOnSelect({ onSelect, children, ...props }: any) { const { setOpenMobile } = useSidebar(); return <button {...props} onClick={() => { setOpenMobile(false); onSelect(); }}>{children}</button>; }

export default function Workspace() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [active, setActive] = useState<Board | null>(null);
  const [initial, setInitial] = useState<Scene | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [loadError, setLoadError] = useState(''); const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false); const [search, setSearch] = useState(''); const [tab, setTab] = useState('all');
  const [templateOpen, setTemplateOpen] = useState(false); const [exportOpen, setExportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); const [deleteTarget, setDeleteTarget] = useState<Board | null>(null);
  const [renameTarget, setRenameTarget] = useState<Board | null>(null); const [renameDraft, setRenameDraft] = useState('');
  const [dark, setDark] = useState(false); const [grid, setGrid] = useState(false); const [presenting, setPresenting] = useState(false);
  const [count, setCount] = useState(0); const [selection, setSelection] = useState(0);
  const [format, setFormat] = useState('png'); const [scale, setScale] = useState('2'); const [transparent, setTransparent] = useState(false); const [onlySelected, setOnlySelected] = useState(false); const [exporting, setExporting] = useState(false);
  const editor = useRef<EditorHandle | null>(null); const activeRef = useRef<Board | null>(null); const latest = useRef<Scene | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null); const changed = useRef(0); const saved = useRef(0); const saving = useRef<Promise<boolean> | null>(null); const loaded = useRef(false);
  const importInput = useRef<HTMLInputElement>(null); const actions = useRef<any>({});
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    if (saving.current) return saving.current;
    const run = async () => {
      try {
        while (changed.current > saved.current && activeRef.current && latest.current) {
          setStatus('saving'); const seq = changed.current; const board = activeRef.current;
          const result = await request(`/api/boards/${board.id}`, { method: 'PUT', body: JSON.stringify({ scene: latest.current, revision: board.revision }) });
          const next = { ...activeRef.current!, revision: result.revision, updatedAt: result.updatedAt };
          activeRef.current = next; setActive(next); setBoards(items => items.map(b => b.id === next.id ? next : b));
          saved.current = seq;
        }
        setStatus('saved'); setSaveError(''); return true;
      } catch (e: any) { setStatus('error'); setSaveError(e.message); return false; }
    };
    saving.current = run(); const result = await saving.current; saving.current = null; return result;
  }, []);
  const activate = (board: Board, scene: Scene) => {
    activeRef.current = board; latest.current = scene; editor.current = null; changed.current = 0; saved.current = 0;
    setActive(board); setInitial(scene); setTitleDraft(board.title); setCount(scene.elements.filter(e => !e.isDeleted).length); setStatus('saved'); setSaveError('');
    const url = new URL(window.location.href); url.searchParams.set('board', board.id); window.history.replaceState(null, '', url);
  };
  const initialize = async () => {
    setLoadError('');
    try {
      await drawingModule();
      const { boards: existing } = await request('/api/boards');
      if (!existing.length) {
        const { makeScene } = await drawingModule(); const scene = makeScene('playground');
        const board = await request('/api/boards', { method: 'POST', body: JSON.stringify({ title: 'Idea playground', scene, color: '#ffe29a' }) });
        setBoards([board]); activate(board, scene);
      } else {
        setBoards(existing); const id = new URLSearchParams(window.location.search).get('board');
        const chosen = existing.find((b: Board) => b.id === id) ?? existing[0];
        const data = await request(`/api/boards/${chosen.id}`); activate(data.board, data.scene);
      }
    } catch (e: any) { setLoadError(e.message); }
  };
  useEffect(() => { if (loaded.current) return; loaded.current = true; setDark(localStorage.getItem('inkspace-theme') === 'dark'); setGrid(localStorage.getItem('inkspace-grid') === 'true'); void initialize(); }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('inkspace-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => { localStorage.setItem('inkspace-grid', String(grid)); }, [grid]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (changed.current > saved.current) { e.preventDefault(); e.returnValue = ''; } };
    const hidden = () => { if (document.visibilityState === 'hidden') void flush(); };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void flush(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('visibilitychange', hidden); window.addEventListener('keydown', keys);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('keydown', keys); if (timer.current) clearTimeout(timer.current); };
  }, [flush]);
  const sceneChanged = useCallback((scene: Scene) => { latest.current = scene; changed.current += 1; setStatus('unsaved'); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void flush(); }, 900); }, [flush]);
  const openBoard = async (id: string) => {
    if (id === activeRef.current?.id || busy) return; setBusy(true);
    try { if (!await flush()) return; const data = await request(`/api/boards/${id}`); activate(data.board, data.scene); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const createBoard = async (id: TemplateId = 'blank', name?: string, copy = false) => {
    if (busy) return; setBusy(true);
    try {
      if (!copy && !await flush()) return;
      const { makeScene } = await drawingModule(); const template = templates.find(t => t.id === id);
      const scene = copy ? editor.current?.snapshot() ?? latest.current : makeScene(id);
      if (!scene) throw new Error('Wait for your canvas to open.');
      const board = await request('/api/boards', { method: 'POST', body: JSON.stringify({ title: name ?? template?.name ?? 'Untitled board', scene, color: copy ? activeRef.current?.color : template?.color }) });
      setBoards(items => [board, ...items]); activate(board, scene); setTemplateOpen(false); setTab('all'); setSearch('');
      toast.success(copy ? 'A fresh copy is saved.' : 'Your new canvas is ready.'); return board;
    } catch (e: any) { toast.error(e.message); throw e; } finally { setBusy(false); }
  };
  const doCreate = (id: TemplateId, name?: string, copy = false) => { void createBoard(id, name, copy).catch(() => {}); };
  const updateMetadata = async (patch: { title?: string; favorite?: boolean }, id = activeRef.current?.id): Promise<boolean> => {
    if (!id) return false;
    try {
      const result = await request(`/api/boards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setBoards(items => items.map(b => b.id === id ? { ...b, title: result.title, favorite: result.favorite } : b));
      if (activeRef.current?.id === id) { const next = { ...activeRef.current, title: result.title, favorite: result.favorite }; activeRef.current = next; setActive(next); setTitleDraft(next.title); }
      return true;
    } catch (e: any) { toast.error(e.message); if (activeRef.current?.id === id) setTitleDraft(activeRef.current.title); return false; }
  };
  const rename = () => { const title = titleDraft.trim(); if (!title) setTitleDraft(active?.title ?? ''); else if (title !== active?.title) void updateMetadata({ title }); };
  const showRename = (board: Board) => { setRenameDraft(board.title); setRenameTarget(board); };
  const renameBoard = async () => {
    const title = renameDraft.trim(); if (!renameTarget || !title || busy) return;
    setBusy(true);
    try {
      if (await updateMetadata({ title }, renameTarget.id)) { setRenameTarget(null); toast.success('Board renamed.'); }
    } finally { setBusy(false); }
  };
  const removeBoard = async () => {
    if (!deleteTarget || busy) return; setBusy(true);
    const id = deleteTarget.id; const deletingActive = activeRef.current?.id === id;
    try {
      if (deletingActive) { if (timer.current) clearTimeout(timer.current); if (saving.current) await saving.current; }
      await request(`/api/boards/${id}`, { method: 'DELETE' });
      setBoards(items => items.filter(b => b.id !== id)); setDeleteTarget(null);
      if (deletingActive) {
        changed.current = 0; saved.current = 0; activeRef.current = null; latest.current = null; editor.current = null;
        setActive(null); setInitial(null); setTitleDraft(''); setCount(0); setStatus('saved'); setSaveError('');
        await initialize();
      }
      toast.success('Board deleted.');
    } catch (e: any) { toast.error(e.message); if (deletingActive && changed.current > saved.current) void flush(); } finally { setBusy(false); }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 15000000) throw new Error('Choose a drawing smaller than 15 MB.');
      const json = JSON.parse(await file.text());
      if (!Array.isArray(json.elements) || json.type !== 'excalidraw') throw new Error('Choose an .excalidraw drawing file.');
      setBusy(true); if (!await flush()) return;
      const { restore } = await import('@excalidraw/excalidraw');
      const restored = restore(json, null, null);
      const scene: Scene = { elements: restored.elements, appState: { ...restored.appState, collaborators: undefined }, files: restored.files ?? {} };
      const board = await request('/api/boards', { method: 'POST', body: JSON.stringify({ title: file.name.replace(/\.(excalidraw|json)$/i, '').slice(0, 120) || 'Imported drawing', scene }) });
      setBoards(items => [board, ...items]); activate(board, scene); toast.success('Drawing imported as a new board.');
    } catch (e: any) { toast.error(e.message || 'This file could not be opened.'); } finally { setBusy(false); if (importInput.current) importInput.current.value = ''; }
  };
  const exportBoard = async () => {
    if (!editor.current) return; setExporting(true);
    try {
      const blob = await editor.current.export(format, Number(scale), transparent, onlySelected && selection > 0);
      const { download } = await drawingModule(); download(blob, `${active?.title.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-') || 'Inkspace'}.${format}`);
      toast.success(`Your ${format === 'excalidraw' ? 'editable drawing' : format.toUpperCase()} is downloaded.`); setExportOpen(false);
    } catch (e: any) { toast.error(e.message || 'Export failed. Try a smaller scale.'); } finally { setExporting(false); }
  };
  const showExport = () => { setSelection(editor.current?.selectionCount() ?? 0); setOnlySelected(false); setExportOpen(true); };
  actions.current = { createBoard, openBoard, flush, getBoards: () => boards, getActive: () => activeRef.current, getScene: () => editor.current?.snapshot() ?? latest.current };
  useEffect(() => {
    const context = (document as any).modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: any) => { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({ name: 'list_inkspace_boards', title: 'List whiteboards', description: 'Read the boards in the current private workspace and the active board.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ boards: actions.current.getBoards(), activeBoardId: actions.current.getActive()?.id ?? null }) });
    register({ name: 'create_inkspace_board', title: 'Create a whiteboard', description: 'Create and save a new named whiteboard from a template, then open it in the canvas.', inputSchema: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 120 }, template: { type: 'string', enum: ['blank', 'mindmap', 'flowchart', 'architecture', 'kanban', 'weekly'] } }, required: ['title', 'template'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: async (input: any) => { if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || !templates.some(t => t.id === input.template)) throw new Error('A valid title and template are required.'); const b = await actions.current.createBoard(input.template, input.title); if (!b) throw new Error('Save the current board or wait for the current action.'); return { id: b.id, title: b.title, saved: true }; } });
    register({ name: 'read_inkspace_canvas', title: 'Read active whiteboard', description: 'Read the current board name and its text and shape objects without changing the canvas.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ title: actions.current.getActive()?.title, elements: actions.current.getScene()?.elements.filter((e: any) => !e.isDeleted).map((e: any) => ({ id: e.id, type: e.type, text: e.text, x: e.x, y: e.y, width: e.width, height: e.height })) ?? [] }) });
    return () => lifecycle.abort();
  }, []);
  const filtered = boards.filter(b => (tab !== 'starred' || b.favorite) && b.title.toLowerCase().includes(search.toLowerCase()));
  const shortcuts = [['Select / move', 'V'], ['Rectangle', 'R'], ['Diamond', 'D'], ['Ellipse', 'O'], ['Arrow / connector', 'A'], ['Line', 'L'], ['Freehand drawing', 'P'], ['Text', 'T'], ['Insert image', '9'], ['Pan the canvas', 'Space + drag'], ['Undo / redo', 'Ctrl Z / Ctrl Shift Z'], ['Duplicate selection', 'Ctrl D'], ['Group selection', 'Ctrl G'], ['Save now', 'Ctrl S']];
  return <SidebarProvider className={`workspace ${presenting ? 'present-mode' : ''}`} style={{ '--sidebar-width': '250px' } as React.CSSProperties}>
    <Sidebar className="ink-sidebar"><div className="sidebar-inside">
      <div className="brand"><img src="/favicon.svg" alt="" /><span className="brand-name">inkspace</span><span className="studio-pill">STUDIO</span></div>
      <div className="workspace-label"><LockKeyhole /><span>Personal workspace</span></div>
      <button className="new-board" disabled={busy || !active} onClick={() => doCreate('blank', 'Untitled board')}><Plus size={17} /> New board</button>
      <div className="search-boards"><Search /><input aria-label="Search boards" placeholder="Find a board…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <div className="side-section-title">YOUR SPACE</div>
      <Tabs className="board-tabs" value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="all">All boards <span className="opacity-50">{boards.length}</span></TabsTrigger><TabsTrigger value="starred"><Star size={12} /> Starred</TabsTrigger></TabsList>
        <div className="board-list">{filtered.map(b => <div key={b.id} className={`board-row ${active?.id === b.id ? 'active' : ''}`}><CloseSidebarOnSelect className="board-select" disabled={busy} onSelect={() => void openBoard(b.id)} aria-current={active?.id === b.id ? 'page' : undefined}>
          <span className="board-icon" style={{ background: b.color }}><PencilRuler size={15} /></span><span className="board-row-text"><strong>{b.title}</strong><small>{active?.id === b.id ? 'Currently open' : 'Saved board'}</small></span>{!!b.favorite && <Star className="board-row-star" fill="currentColor" />}
        </CloseSidebarOnSelect><DropdownMenu><DropdownMenuTrigger asChild><button className="icon-btn board-row-options" aria-label={`Options for ${b.title}`} disabled={busy}><Ellipsis /></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => showRename(b)}><Pencil /> Rename board</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(b)}><Trash2 /> Delete board</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>)}{!filtered.length && <p className="no-boards">{search ? 'No boards match your search.' : tab === 'starred' ? 'Star a board to keep it close.' : 'Your boards will appear here.'}</p>}</div>
        <div className="side-utilities"><button className="side-link" onClick={() => setTemplateOpen(true)}><LayoutTemplate /> Templates <span className="ml-auto text-xs text-muted-foreground">6</span></button><button className="side-link" disabled={!active || busy} onClick={() => importInput.current?.click()}><Upload /> Import a drawing</button></div>
      </Tabs>
      <div className="sidebar-footer"><div className="avatar">Y</div><div className="footer-user"><strong>Your workspace</strong><small>Private by default</small></div><Hint label={dark ? 'Switch to light mode' : 'Switch to dark mode'}><button className="icon-btn" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</button></Hint></div>
    </div></Sidebar>
    <main className="editor-main">
      <header className="board-header"><div className="header-start"><SidebarToggle /><div className="header-board-icon"><PencilRuler size={18} /></div><div className="board-titles"><input className="board-title-input" aria-label="Board name" maxLength={120} value={titleDraft} onChange={e => setTitleDraft(e.target.value)} onBlur={rename} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} placeholder="Your canvas" disabled={!active} />
        <div className={`save-status ${status === 'error' ? 'error' : ''}`} role="status">{status === 'saved' ? <CloudCheck /> : status === 'error' ? <CloudOff /> : <CloudUpload />}{status === 'saved' ? 'All changes saved' : status === 'saving' ? 'Saving your changes…' : status === 'unsaved' ? 'Changes waiting to save…' : 'Changes not saved'}</div></div>
        <Hint label={active?.favorite ? 'Unstar board' : 'Star this board'}><button className={`icon-btn star-btn ${active?.favorite ? 'starred' : ''}`} aria-label={active?.favorite ? 'Unstar board' : 'Star board'} disabled={!active} onClick={() => void updateMetadata({ favorite: !active?.favorite })}><Star fill={active?.favorite ? 'currentColor' : 'none'} /></button></Hint>
        <DropdownMenu><DropdownMenuTrigger asChild><button className="icon-btn" aria-label="Board options" disabled={!active || busy}><Ellipsis /></button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={() => active && showRename(active)}><Pencil /> Rename board</DropdownMenuItem><DropdownMenuItem onSelect={() => doCreate('blank', `${active?.title ?? 'Board'} copy`, true)}><Copy /> Duplicate board</DropdownMenuItem><DropdownMenuItem onSelect={() => { setFormat('excalidraw'); showExport(); }}><Download /> Download editable file</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(active)}><Trash2 /> Delete board</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div><div className="header-actions"><Hint label="Present this board"><button className="header-btn present-button" disabled={!active} onClick={() => setPresenting(true)}><Presentation /><span className="btn-label">Present</span></button></Hint><button className="header-btn primary" disabled={!active} onClick={showExport}><Download /><span>Export</span><ChevronDown size={12} /></button></div></header>
      {saveError && <div className="error-banner" role="alert"><span>{saveError}</span><button onClick={() => void flush()}>Retry save</button><button disabled={busy} onClick={() => doCreate('blank', `${active?.title ?? 'Board'} recovered`, true)}>Save a copy</button><button onClick={() => { setFormat('excalidraw'); showExport(); }}>Export backup</button></div>}
      <div className="canvas-wrap">
        {initial && active ? <DrawingEditor key={active.id} initial={initial} title={active.title} dark={dark} grid={grid} presenting={presenting} onChange={sceneChanged} onReady={handle => { editor.current = handle; }} onCount={setCount} /> : <div className={`loading-state ${loadError ? 'error-state' : ''}`}>{loadError ? <><CloudOff /><p>{loadError}</p><button className="header-btn" onClick={() => void initialize()}>Try again</button></> : <><Loader2 className="spin" /><span>Making room for your ideas…</span></>}</div>}
        {active && !presenting && <div className="canvas-addons"><Hint label="Add a sticky note"><button aria-label="Add sticky note" onClick={() => editor.current?.addNote()}><StickyNote /></button></Hint><Hint label="Explore templates"><button aria-label="Open templates" onClick={() => setTemplateOpen(true)}><LayoutTemplate /></button></Hint></div>}
        {busy && <div className="busy-overlay" aria-live="polite"><span>Just a moment…</span></div>}
        {presenting && <div className="presentation-bar"><Presentation size={16} /><span>{active?.title}</span><button onClick={() => setPresenting(false)}>Exit presentation <span className="opacity-60">Esc</span></button></div>}
      </div>
      <footer className="canvas-strip"><div className="canvas-strip-left"><span className="canvas-hint">A space to think freely.</span><span className="strip-divider canvas-hint"/><button aria-label="Fit drawing to screen" onClick={() => editor.current?.fit()}><Maximize /><span className="fit-label">Fit to screen</span></button><button className={grid ? 'active' : ''} aria-pressed={grid} onClick={() => setGrid(!grid)}><Grid2X2 /> Grid</button></div><div className="canvas-strip-right"><span className="object-count">{count} objects</span><span className="strip-divider object-count"/><button onClick={() => setHelpOpen(true)}><Keyboard /> Shortcuts</button><Hint label="Your boards are private and saved automatically"><span><ShieldCheck /></span></Hint></div></footer>
    </main>
    <input ref={importInput} type="file" accept=".excalidraw,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
    <Dialog open={templateOpen} onOpenChange={setTemplateOpen}><DialogContent className="templates-dialog"><DialogHeader><div className="modal-eyebrow">A PLACE TO START</div><DialogTitle>Big ideas deserve a head start.</DialogTitle><DialogDescription>Choose a canvas and make it yours. Each template opens as a new board.</DialogDescription></DialogHeader><div className="template-grid">{templates.map(t => <button className="template-card" disabled={busy || !active} key={t.id} onClick={() => doCreate(t.id, t.id === 'blank' ? 'Untitled board' : t.name)}><div className="template-preview"><TemplatePreview id={t.id} /></div><div className="template-description"><span>{t.category}</span><strong>{t.name}</strong><p>{t.description}</p></div></button>)}</div></DialogContent></Dialog>
    <Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent className="export-dialog"><DialogHeader><DialogTitle>Take your ideas with you.</DialogTitle><DialogDescription>Export “{active?.title}” to share or keep.</DialogDescription></DialogHeader><Tabs className="export-format" value={format} onValueChange={setFormat}><TabsList><TabsTrigger value="png">PNG image</TabsTrigger><TabsTrigger value="svg">SVG vector</TabsTrigger><TabsTrigger value="excalidraw">Editable</TabsTrigger></TabsList></Tabs>
      {format !== 'excalidraw' ? <div>{format === 'png' && <div className="setting-row"><div>Resolution<small>Sharper images for larger screens.</small></div><Select value={scale} onValueChange={setScale}><SelectTrigger className="w-28" aria-label="Export resolution"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1× Standard</SelectItem><SelectItem value="2">2× High</SelectItem><SelectItem value="3">3× Ultra</SelectItem></SelectContent></Select></div>}
      <div className="setting-row"><label htmlFor="transparent">Transparent background</label><Switch id="transparent" checked={transparent} onCheckedChange={setTransparent} /></div><div className="setting-row"><div><label htmlFor="selected-only">Selection only</label><small>{selection ? `${selection} selected objects` : 'Select objects on your canvas first.'}</small></div><Switch id="selected-only" disabled={!selection} checked={onlySelected} onCheckedChange={setOnlySelected} /></div></div> : <div className="export-note">An .excalidraw file keeps your shapes, text, and images editable. Open it here or in Excalidraw.</div>}
      <button className="header-btn primary wide-btn" disabled={exporting} onClick={() => void exportBoard()}>{exporting ? <Loader2 className="spin" /> : <Download />}{exporting ? 'Preparing your export…' : `Download ${format === 'excalidraw' ? 'editable drawing' : format.toUpperCase()}`}</button></DialogContent></Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="shortcuts-dialog max-h-[85dvh] overflow-auto"><DialogHeader><DialogTitle>A few handy shortcuts.</DialogTitle><DialogDescription>Click the canvas first. Use ⌘ instead of Ctrl on a Mac.</DialogDescription></DialogHeader><div>{shortcuts.map(([label, key]) => <div className="shortcut-row" key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><p className="text-sm text-muted-foreground leading-relaxed">Double-click a shape to add text. Drag a selection to move it; use its corner handles to resize. Drag with the hand tool to explore your canvas.</p></DialogContent></Dialog>
    <Dialog open={!!renameTarget} onOpenChange={open => { if (!open && !busy) setRenameTarget(null); }}><DialogContent showCloseButton={!busy}><DialogHeader><DialogTitle>Rename board</DialogTitle><DialogDescription>Give “{renameTarget?.title}” a new name.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); void renameBoard(); }}><div className="space-y-2"><label htmlFor="rename-board-name" className="text-sm font-medium">Board name</label><Input id="rename-board-name" value={renameDraft} onChange={e => setRenameDraft(e.target.value)} onFocus={e => e.currentTarget.select()} maxLength={120} required disabled={busy} /></div><DialogFooter><button type="button" className="header-btn" disabled={busy} onClick={() => setRenameTarget(null)}>Cancel</button><button type="submit" className="header-btn primary" disabled={busy || !renameDraft.trim()}>{busy ? 'Saving…' : 'Save name'}</button></DialogFooter></form></DialogContent></Dialog>
    <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !busy) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle><AlertDialogDescription>This permanently deletes this board. Download an editable copy first if you might need it later.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep board</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white" disabled={busy} onClick={e => { e.preventDefault(); void removeBoard(); }}>{busy ? 'Deleting…' : 'Delete board'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Toaster position="bottom-center" richColors theme={dark ? 'dark' : 'light'} />
  </SidebarProvider>;
}
