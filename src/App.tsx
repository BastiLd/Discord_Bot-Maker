import { useEffect, useId, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  ConnectionMode,
  MarkerType,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';

import { BuilderNodeCard } from './components/BuilderNodeCard';
import { builderTemplates } from './data/templates';
import { archiveToBlob, buildArchive, downloadBlob } from './lib/exporter';
import { importProjectArchive } from './lib/parser';
import { cloneProject, createEmptyProject, createNode, summarizeProject, touchProject } from './lib/project';
import { clearProject, loadProject, saveProject } from './lib/storage';
import type { BotProject, BuilderNode, BuilderNodeData, NodeKind, RunInstructions } from './types';

const nodeTypes = {
  builderNode: BuilderNodeCard,
};

const UI_PREFS_KEY = 'discord-bot-maker/ui-prefs';

type SectionKey =
  | 'project'
  | 'templates'
  | 'palette'
  | 'overview'
  | 'layout'
  | 'inspector'
  | 'preview'
  | 'warnings';

type SectionState = Record<SectionKey, boolean>;

interface UiPrefs {
  leftPanelWidth: number;
  rightPanelWidth: number;
  sections: SectionState;
}

const DEFAULT_SECTIONS: SectionState = {
  project: false,
  templates: false,
  palette: false,
  overview: false,
  layout: false,
  inspector: false,
  preview: false,
  warnings: false,
};

function loadUiPrefs(): UiPrefs {
  if (typeof window === 'undefined') {
    return {
      leftPanelWidth: 320,
      rightPanelWidth: 380,
      sections: DEFAULT_SECTIONS,
    };
  }

  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) {
      return {
        leftPanelWidth: 320,
        rightPanelWidth: 380,
        sections: DEFAULT_SECTIONS,
      };
    }

    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      leftPanelWidth: parsed.leftPanelWidth ?? 320,
      rightPanelWidth: parsed.rightPanelWidth ?? 380,
      sections: {
        ...DEFAULT_SECTIONS,
        ...parsed.sections,
      },
    };
  } catch {
    return {
      leftPanelWidth: 320,
      rightPanelWidth: 380,
      sections: DEFAULT_SECTIONS,
    };
  }
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function defaultNodeData(kind: NodeKind): Partial<BuilderNodeData> {
  switch (kind) {
    case 'command':
      return {
        title: 'Neuer Command',
        summary: 'Slash- oder Prefix-Trigger f\u00fcr deinen Bot.',
        commandName: 'new_command',
        commandDescription: 'Beschreibt den Command.',
        commandStyle: 'slash',
      };
    case 'event':
      return {
        title: 'Neues Event',
        summary: 'Server- oder Discord-Ereignis als Trigger.',
        eventName: 'on_ready',
      };
    case 'action':
      return {
        title: 'Neue Aktion',
        summary: 'Antwortet oder f\u00fchrt eine Bot-Aktion aus.',
        actionType: 'reply',
        responseText: 'Hier kommt deine Discord-Antwort hin.',
      };
    case 'condition':
      return {
        title: 'Neue Bedingung',
        summary: 'Markiert eine Pr\u00fcfregel im Flow.',
        conditionType: 'has-role',
        conditionValue: 'Moderator',
      };
    case 'ui':
      return {
        title: 'Neue UI',
        summary: 'Button, Select oder Modal.',
        uiType: 'button',
        buttonLabel: 'Klick mich',
        responseText: 'Button wurde ausgel\u00f6st.',
      };
    case 'storage':
      return {
        title: 'Neue Variable',
        summary: 'Persistente oder lokale Werte im Flow.',
        variableName: 'ticket_status',
        variableValue: 'open',
      };
    default:
      return {};
  }
}

function previewText(node: BuilderNode | undefined): string {
  if (!node) {
    return 'W\u00e4hle einen Node aus, um eine Vorschau zu sehen.';
  }

  if (node.data.actionType === 'reply') {
    return node.data.responseText ?? 'Leere Antwort';
  }

  if (node.data.actionType === 'embed') {
    return `${node.data.embedTitle ?? 'Embed'}\n${node.data.embedDescription ?? ''}`.trim();
  }

  if (node.data.uiType === 'button') {
    return `${node.data.buttonLabel ?? 'Button'} -> ${node.data.responseText ?? 'Keine Callback-Nachricht'}`;
  }

  if (node.data.kind === 'command') {
    return `${node.data.commandStyle === 'prefix' ? '!' : '/'}${node.data.commandName ?? 'command'}`;
  }

  if (node.data.kind === 'event') {
    return node.data.eventName ?? 'on_ready';
  }

  return node.data.notes ?? node.data.summary;
}

interface PanelSectionProps {
  title: string;
  badge?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function PanelSection({ title, badge, collapsed, onToggle, children }: PanelSectionProps) {
  return (
    <section className={`panel-section${collapsed ? ' is-collapsed' : ''}`}>
      <div className="section-heading">
        <div className="section-heading__main">
          <h2>{title}</h2>
          {badge ? <span>{badge}</span> : null}
        </div>
        <button className="collapse-button" type="button" onClick={onToggle} aria-expanded={!collapsed}>
          {collapsed ? 'Aufklappen' : 'Einklappen'}
        </button>
      </div>
      {!collapsed ? <div className="panel-section__body">{children}</div> : null}
    </section>
  );
}

export default function App() {
  const persisted = loadProject();
  const initialProject = persisted ?? createEmptyProject();
  const uiPrefs = loadUiPrefs();
  const fileInputId = useId();

  const [project, setProject] = useState<BotProject>(initialProject);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialProject.graph.nodes[0]?.id ?? null);
  const [status, setStatus] = useState('Lokale Sicherung aktiv. GitHub Pages bleibt das prim\u00e4re Deployment-Ziel.');
  const [busy, setBusy] = useState(false);
  const [runInstructions, setRunInstructions] = useState<RunInstructions | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(uiPrefs.leftPanelWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(uiPrefs.rightPanelWidth);
  const [collapsedSections, setCollapsedSections] = useState<SectionState>(uiPrefs.sections);

  useEffect(() => {
    saveProject(project);
  }, [project]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({
        leftPanelWidth,
        rightPanelWidth,
        sections: collapsedSections,
      }),
    );
  }, [collapsedSections, leftPanelWidth, rightPanelWidth]);

  const selectedNode = project.graph.nodes.find((node) => node.id === selectedNodeId);
  const summary = summarizeProject(project);
  const archivePreview = buildArchive(project);
  const workspaceStyle = {
    '--sidebar-width': `${leftPanelWidth}px`,
    '--inspector-width': `${rightPanelWidth}px`,
  } as CSSProperties;

  function toggleSection(key: SectionKey): void {
    setCollapsedSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function replaceProject(nextProject: BotProject): void {
    setProject(nextProject);
    setSelectedNodeId(nextProject.graph.nodes[0]?.id ?? null);
  }

  function mutateProject(mutator: (current: BotProject) => BotProject): void {
    setProject((current) => touchProject(mutator(current)));
  }

  function updateMetadata<Key extends keyof BotProject['metadata']>(key: Key, value: BotProject['metadata'][Key]): void {
    mutateProject((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        [key]: value,
      },
    }));
  }

  function updateSelectedNodeData(patch: Partial<BuilderNodeData>): void {
    if (!selectedNodeId) {
      return;
    }

    mutateProject((current) => ({
      ...current,
      graph: {
        ...current.graph,
        nodes: current.graph.nodes.map((node) =>
          node.id === selectedNodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      },
    }));
  }

  function handleNodesChange(changes: NodeChange<BuilderNode>[]): void {
    mutateProject((current) => ({
      ...current,
      graph: {
        ...current.graph,
        nodes: applyNodeChanges(changes, current.graph.nodes),
      },
    }));
  }

  function handleEdgesChange(changes: EdgeChange[]): void {
    mutateProject((current) => ({
      ...current,
      graph: {
        ...current.graph,
        edges: applyEdgeChanges(changes, current.graph.edges),
      },
    }));
  }

  function handleConnect(connection: Connection): void {
    mutateProject((current) => ({
      ...current,
      graph: {
        ...current.graph,
        edges: addEdge(
          {
            ...connection,
            animated: false,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#f2a56b', strokeWidth: 2 },
          },
          current.graph.edges,
        ),
      },
    }));
  }

  function handleAddNode(kind: NodeKind): void {
    const nextNode = createNode(
      kind,
      {
        x: 180 + (project.graph.nodes.length % 3) * 280,
        y: 80 + project.graph.nodes.length * 48,
      },
      defaultNodeData(kind),
    );

    mutateProject((current) => ({
      ...current,
      graph: {
        ...current.graph,
        nodes: [...current.graph.nodes, nextNode],
      },
    }));
    setSelectedNodeId(nextNode.id);
    setStatus(`${kind}-Node hinzugef\u00fcgt.`);
  }

  function handleTemplateLoad(templateId: string): void {
    const template = builderTemplates.find((entry) => entry.id === templateId);
    if (!template) {
      return;
    }

    const nextProject = touchProject(cloneProject(template.project));
    replaceProject(nextProject);
    setStatus(`Template geladen: ${template.name}`);
  }

  function handleNewProject(): void {
    const nextProject = createEmptyProject();
    clearProject();
    replaceProject(nextProject);
    setStatus('Neues Projekt angelegt.');
  }

  function handleLocalSave(): void {
    saveProject(project);
    setStatus(`Lokal gesichert um ${formatTimestamp(new Date().toISOString())}.`);
  }

  function handleExportJson(): void {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${project.id || 'discord-bot-maker'}.json`);
    setStatus('Projekt-JSON exportiert.');
  }

  async function handleExportZip(): Promise<void> {
    setBusy(true);
    try {
      const archive = buildArchive(project);
      const blob = await archiveToBlob(project);
      downloadBlob(blob, `${project.id || 'discord-bot-maker'}.zip`);
      setRunInstructions(archive.runInstructions);
      setStatus(`Bot-ZIP exportiert. ${archive.warnings.length ? 'Pr\u00fcfe zus\u00e4tzlich EXPORT_NOTES.md.' : 'Export ohne zus\u00e4tzliche Warnungen.'}`);
    } catch (error) {
      setStatus(`ZIP-Export fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setBusy(true);
    try {
      const imported = await importProjectArchive(file);
      replaceProject(imported);
      setStatus(imported.reconstruction?.importMode === 'roundtrip' ? `Round-Trip-Import geladen aus ${file.name}.` : `ZIP rekonstruiert aus ${file.name}. Pr\u00fcfe die Warnungen rechts.`);
    } catch (error) {
      setStatus(`Import fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar glass-panel">
        <div>
          <span className="eyebrow">Discord Bot Maker</span>
          <h1>{project.metadata.name}</h1>
          <p>Statische Builder-App mit ZIP-Round-Trip, Python-Rekonstruktion und sauberem GitHub-Pages-Deployment.</p>
        </div>
        <div className="topbar__actions">
          <button className="secondary-button" type="button" onClick={handleNewProject}>Neu</button>
          <button className="secondary-button" type="button" onClick={handleLocalSave}>Lokal sichern</button>
          <button className="secondary-button" type="button" onClick={handleExportJson}>JSON exportieren</button>
          <button className="primary-button" type="button" onClick={() => void handleExportZip()} disabled={busy}>Bot-ZIP exportieren</button>
          <input id={fileInputId} className="hidden-input" type="file" accept=".zip" onChange={(event) => void handleImport(event)} />
          <label className="secondary-button" htmlFor={fileInputId}>ZIP importieren</label>
        </div>
      </header>

      <main className="workspace-grid" style={workspaceStyle}>
        <aside className="sidebar glass-panel">
          <PanelSection title="Projekt" badge={formatTimestamp(project.lastSavedAt)} collapsed={collapsedSections.project} onToggle={() => toggleSection('project')}>
            <label><span>Name</span><input value={project.metadata.name} onChange={(event) => updateMetadata('name', event.target.value)} /></label>
            <label><span>Beschreibung</span><textarea value={project.metadata.description} onChange={(event) => updateMetadata('description', event.target.value)} rows={3} /></label>
            <div className="field-grid field-grid--two">
              <label><span>Level</span><select value={project.metadata.mode} onChange={(event) => updateMetadata('mode', event.target.value as BotProject['metadata']['mode'])}><option value="beginner">Anf&auml;nger</option><option value="advanced">Fortgeschritten</option></select></label>
              <label><span>Struktur</span><select value={project.metadata.structure} onChange={(event) => updateMetadata('structure', event.target.value as BotProject['metadata']['structure'])}><option value="modular">Modular</option><option value="single-file">Eine Datei</option></select></label>
            </div>
            <div className="field-grid field-grid--two">
              <label><span>Framework</span><select value={project.metadata.framework} onChange={(event) => updateMetadata('framework', event.target.value)}><option value="discord.py">discord.py</option><option value="py-cord">py-cord</option><option value="interactions.py">interactions.py</option></select></label>
              <label><span>Storage</span><select value={project.metadata.storage} onChange={(event) => updateMetadata('storage', event.target.value as BotProject['metadata']['storage'])}><option value="local-json">Lokale JSON</option><option value="sqlite">SQLite</option><option value="supabase">Supabase vorbereitet</option></select></label>
            </div>
            <label><span>Deployment</span><select value={project.metadata.deploymentTarget} onChange={(event) => updateMetadata('deploymentTarget', event.target.value as BotProject['metadata']['deploymentTarget'])}><option value="github-pages">GitHub Pages</option><option value="local-only">Nur lokal</option></select></label>
            <label className="checkbox-row"><input type="checkbox" checked={project.metadata.allowCustomCode} onChange={(event) => updateMetadata('allowCustomCode', event.target.checked)} /><span>Custom-Code-Hooks im Export zulassen</span></label>
          </PanelSection>

          <PanelSection title="Templates" collapsed={collapsedSections.templates} onToggle={() => toggleSection('templates')}>
            <div className="template-list">{builderTemplates.map((template) => <button key={template.id} className="template-card" type="button" onClick={() => handleTemplateLoad(template.id)}><strong>{template.name}</strong><span>{template.description}</span></button>)}</div>
          </PanelSection>

          <PanelSection title="Node-Palette" collapsed={collapsedSections.palette} onToggle={() => toggleSection('palette')}>
            <div className="palette-grid">{(['command', 'event', 'action', 'condition', 'ui', 'storage'] as NodeKind[]).map((kind) => <button key={kind} className="palette-button" type="button" onClick={() => handleAddNode(kind)}>{kind}</button>)}</div>
          </PanelSection>

          <PanelSection title={'Flow-\u00dcbersicht'} collapsed={collapsedSections.overview} onToggle={() => toggleSection('overview')}>
            <div className="summary-grid">{Object.entries(summary).map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>
            <div className="info-callout"><strong>Supabase</strong><p>F&uuml;r die aktuelle Version brauchst du kein Supabase, damit lokal und auf GitHub Pages alles funktioniert. Die optionalen Schritte stehen sp&auml;ter in der Doku.</p></div>
          </PanelSection>

          <PanelSection title="Layout & Komfort" collapsed={collapsedSections.layout} onToggle={() => toggleSection('layout')}>
            <label><span>Linke Panelbreite: {leftPanelWidth}px</span><input type="range" min="280" max="440" step="10" value={leftPanelWidth} onChange={(event) => setLeftPanelWidth(Number(event.target.value))} /></label>
            <label><span>Rechte Panelbreite: {rightPanelWidth}px</span><input type="range" min="320" max="520" step="10" value={rightPanelWidth} onChange={(event) => setRightPanelWidth(Number(event.target.value))} /></label>
            <div className="info-callout info-callout--compact"><strong>Scrollen & Fokus</strong><p>Die Seitenleisten scrollen jetzt getrennt, Bereiche lassen sich einklappen und die Panelbreiten bleiben lokal gespeichert.</p></div>
          </PanelSection>
        </aside>

        <section className="canvas-panel glass-panel">
          <div className="canvas-panel__header"><div><span className="eyebrow">Canvas</span><h2>Visueller Flow</h2></div><div className="status-pill">{busy ? 'Arbeitet' : status}</div></div>
          <div className="canvas-shell">
            <ReactFlow
              nodes={project.graph.nodes}
              edges={project.graph.edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.35}
              maxZoom={1.5}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={52}
              panOnScroll
              panOnScrollSpeed={0.8}
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#f2a56b', strokeWidth: 2 } }}
            >
              <MiniMap pannable zoomable className="minimap" />
              <Controls className="flow-controls" />
              <Background gap={28} color="rgba(255, 226, 195, 0.12)" />
            </ReactFlow>
          </div>
        </section>

        <aside className="inspector glass-panel">
          <PanelSection title="Inspector" badge={selectedNode ? selectedNode.data.kind : 'kein Node'} collapsed={collapsedSections.inspector} onToggle={() => toggleSection('inspector')}>
            {selectedNode ? (
              <div className="inspector-form">
                <label><span>Titel</span><input value={selectedNode.data.title} onChange={(event) => updateSelectedNodeData({ title: event.target.value })} /></label>
                <label><span>Zusammenfassung</span><textarea value={selectedNode.data.summary} rows={3} onChange={(event) => updateSelectedNodeData({ summary: event.target.value })} /></label>
                {selectedNode.data.kind === 'command' ? <><label><span>Command-Name</span><input value={selectedNode.data.commandName ?? ''} onChange={(event) => updateSelectedNodeData({ commandName: event.target.value })} /></label><label><span>Beschreibung</span><input value={selectedNode.data.commandDescription ?? ''} onChange={(event) => updateSelectedNodeData({ commandDescription: event.target.value })} /></label><label><span>Typ</span><select value={selectedNode.data.commandStyle ?? 'slash'} onChange={(event) => updateSelectedNodeData({ commandStyle: event.target.value as BuilderNodeData['commandStyle'] })}><option value="slash">Slash</option><option value="prefix">Prefix</option></select></label></> : null}
                {selectedNode.data.kind === 'event' ? <label><span>Event-Name</span><input value={selectedNode.data.eventName ?? ''} onChange={(event) => updateSelectedNodeData({ eventName: event.target.value })} /></label> : null}
                {selectedNode.data.kind === 'action' ? <><label><span>Aktionstyp</span><select value={selectedNode.data.actionType ?? 'reply'} onChange={(event) => updateSelectedNodeData({ actionType: event.target.value as BuilderNodeData['actionType'] })}><option value="reply">Reply</option><option value="embed">Embed</option><option value="assign-role">Assign Role</option><option value="log">Log</option></select></label>{selectedNode.data.actionType === 'embed' ? <><label><span>Embed-Titel</span><input value={selectedNode.data.embedTitle ?? ''} onChange={(event) => updateSelectedNodeData({ embedTitle: event.target.value })} /></label><label><span>Embed-Beschreibung</span><textarea value={selectedNode.data.embedDescription ?? ''} rows={4} onChange={(event) => updateSelectedNodeData({ embedDescription: event.target.value })} /></label></> : null}{selectedNode.data.actionType === 'assign-role' ? <label><span>Rollenname</span><input value={selectedNode.data.roleName ?? ''} onChange={(event) => updateSelectedNodeData({ roleName: event.target.value })} /></label> : null}{selectedNode.data.actionType === 'reply' || selectedNode.data.actionType === 'log' ? <label><span>Antwort / Notiz</span><textarea value={selectedNode.data.responseText ?? selectedNode.data.notes ?? ''} rows={4} onChange={(event) => updateSelectedNodeData({ responseText: event.target.value, notes: event.target.value })} /></label> : null}</> : null}
                {selectedNode.data.kind === 'ui' ? <><label><span>UI-Typ</span><select value={selectedNode.data.uiType ?? 'button'} onChange={(event) => updateSelectedNodeData({ uiType: event.target.value as BuilderNodeData['uiType'] })}><option value="button">Button</option><option value="select">Select</option><option value="modal">Modal</option></select></label><label><span>Label</span><input value={selectedNode.data.buttonLabel ?? ''} onChange={(event) => updateSelectedNodeData({ buttonLabel: event.target.value })} /></label><label><span>Callback-Text</span><textarea value={selectedNode.data.responseText ?? ''} rows={4} onChange={(event) => updateSelectedNodeData({ responseText: event.target.value })} /></label></> : null}
                {selectedNode.data.kind === 'condition' ? <><label><span>Bedingung</span><select value={selectedNode.data.conditionType ?? 'has-role'} onChange={(event) => updateSelectedNodeData({ conditionType: event.target.value as BuilderNodeData['conditionType'] })}><option value="has-role">Has Role</option><option value="message-contains">Message Contains</option><option value="is-admin">Is Admin</option></select></label><label><span>Wert</span><input value={selectedNode.data.conditionValue ?? ''} onChange={(event) => updateSelectedNodeData({ conditionValue: event.target.value })} /></label></> : null}
                {selectedNode.data.kind === 'storage' ? <><label><span>Variablenname</span><input value={selectedNode.data.variableName ?? ''} onChange={(event) => updateSelectedNodeData({ variableName: event.target.value })} /></label><label><span>Wert</span><textarea value={selectedNode.data.variableValue ?? ''} rows={3} onChange={(event) => updateSelectedNodeData({ variableValue: event.target.value })} /></label></> : null}
              </div>
            ) : <div className="empty-state"><p>W&auml;hle einen Node oder lege links einen neuen an.</p></div>}
          </PanelSection>

          <PanelSection title="Vorschau" collapsed={collapsedSections.preview} onToggle={() => toggleSection('preview')}>
            <div className="preview-card"><p>{previewText(selectedNode)}</p></div>
            <div className="file-list"><strong>ZIP-Inhalt</strong>{archivePreview.files.map((file) => <span key={file.path}>{file.path}</span>)}</div>
          </PanelSection>

          <PanelSection title="Import & Warnungen" collapsed={collapsedSections.warnings} onToggle={() => toggleSection('warnings')}>
            {project.reconstruction ? <div className="warning-list"><div className="info-callout info-callout--compact"><strong>{project.reconstruction.importMode === 'roundtrip' ? 'Round-Trip-Import' : 'Best-Effort-Rekonstruktion'}</strong><p>{project.reconstruction.sourceFiles.length} Python-Dateien verarbeitet.</p></div>{project.reconstruction.commands.length ? <span>Commands: {project.reconstruction.commands.join(', ')}</span> : null}{project.reconstruction.events.length ? <span>Events: {project.reconstruction.events.join(', ')}</span> : null}{project.reconstruction.uiComponents.length ? <span>UI: {project.reconstruction.uiComponents.join(', ')}</span> : null}{project.reconstruction.rawMessages.length ? <span>Texte: {project.reconstruction.rawMessages.join(' | ')}</span> : null}{(project.reconstruction.warnings.length ? project.reconstruction.warnings : archivePreview.warnings).map((warning) => <span key={warning}>{warning}</span>)}</div> : archivePreview.warnings.length ? <div className="warning-list">{archivePreview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : <div className="empty-state"><p>Noch keine Warnungen. Der aktuelle Flow ist exportbereit.</p></div>}
          </PanelSection>
        </aside>
      </main>

      {runInstructions ? <div className="modal-backdrop" role="presentation" onClick={() => setRunInstructions(null)}><div className="modal-card glass-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="section-heading"><div className="section-heading__main"><h2>Bot starten</h2><span>Direkt aus dem Export</span></div><button className="secondary-button" type="button" onClick={() => setRunInstructions(null)}>Schlie&szlig;en</button></div><div className="modal-grid"><article><h3>Windows 11</h3><pre>{runInstructions.windows.join('\n')}</pre></article><article><h3>macOS</h3><pre>{runInstructions.macos.join('\n')}</pre></article></div></div></div> : null}
    </div>
  );
}