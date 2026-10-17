import './styles.css';
import { GraphModel, getDefaultSnapshot } from './model.js';
import { ForceLayout } from './physics.js';
import { GraphRenderer } from './renderer.js';
import { downloadPng, downloadSvg, copyText, getSvgMarkup } from './export.js';
import { GraphDataSync } from './data-sync.js';
import {
  COLOR_OPTIONS,
  type GraphSnapshot,
  type IndexMode,
  type ParseIssue,
  type ViewMode,
} from './types.js';
import {
  createSegmented,
  createToastRoot,
  el,
  makeField,
  makeLabel,
  makeRange,
  makeSelect,
  showToast,
} from './dom.js';

const STORAGE_KEY = 'csa-graph-editor-selfloops-v1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root was not found.');
}

function loadSnapshot(): GraphSnapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GraphSnapshot;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Could not restore the saved graph.', error);
  }
  return getDefaultSnapshot();
}

const model = new GraphModel(loadSnapshot());
let mode: ViewMode = 'Force';
let renderer: GraphRenderer;
let undoStack: GraphSnapshot[] = [];
let redoStack: GraphSnapshot[] = [];
let dragBefore: GraphSnapshot | null = null;
let dataTimer = 0;
let saveTimer = 0;

const toastRoot = createToastRoot();
document.body.appendChild(toastRoot);

function notify(message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  showToast(toastRoot, message, kind);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  notify(message, 'error');
}

function makeButton(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', className, text);
  button.type = 'button';
  button.addEventListener('click', onClick);
  return button;
}

function makeBrandMark(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('width', '36');
  svg.setAttribute('height', '36');
  svg.setAttribute('aria-hidden', 'true');
  const line1 = document.createElementNS(SVG_NS, 'line');
  line1.setAttribute('x1', '9');
  line1.setAttribute('y1', '11');
  line1.setAttribute('x2', '26');
  line1.setAttribute('y2', '8');
  line1.setAttribute('stroke', '#5bc0de');
  line1.setAttribute('stroke-width', '2');
  const line2 = document.createElementNS(SVG_NS, 'line');
  line2.setAttribute('x1', '9');
  line2.setAttribute('y1', '11');
  line2.setAttribute('x2', '18');
  line2.setAttribute('y2', '27');
  line2.setAttribute('stroke', '#5bc0de');
  line2.setAttribute('stroke-width', '2');
  const line3 = document.createElementNS(SVG_NS, 'line');
  line3.setAttribute('x1', '26');
  line3.setAttribute('y1', '8');
  line3.setAttribute('x2', '18');
  line3.setAttribute('y2', '27');
  line3.setAttribute('stroke', '#5bc0de');
  line3.setAttribute('stroke-width', '2');
  const circle1 = document.createElementNS(SVG_NS, 'circle');
  circle1.setAttribute('cx', '9');
  circle1.setAttribute('cy', '11');
  circle1.setAttribute('r', '3.5');
  circle1.setAttribute('fill', '#ffffff');
  const circle2 = document.createElementNS(SVG_NS, 'circle');
  circle2.setAttribute('cx', '26');
  circle2.setAttribute('cy', '8');
  circle2.setAttribute('r', '3.5');
  circle2.setAttribute('fill', '#ffffff');
  const circle3 = document.createElementNS(SVG_NS, 'circle');
  circle3.setAttribute('cx', '18');
  circle3.setAttribute('cy', '27');
  circle3.setAttribute('r', '3.5');
  circle3.setAttribute('fill', '#ffffff');
  svg.appendChild(line1);
  svg.appendChild(line2);
  svg.appendChild(line3);
  svg.appendChild(circle1);
  svg.appendChild(circle2);
  svg.appendChild(circle3);
  return svg;
}

function makeCode(text: string): HTMLElement {
  return el('code', 'inline-code', text);
}

function appendInline(parent: HTMLElement, parts: Array<string | HTMLElement>): void {
  for (const part of parts) {
    if (typeof part === 'string') {
      parent.appendChild(document.createTextNode(part));
    } else {
      parent.appendChild(part);
    }
  }
}

function makeList(items: Array<string | HTMLElement>): HTMLUListElement {
  const list = el('ul', 'tip-list');
  for (const item of items) {
    const li = el('li');
    if (typeof item === 'string') {
      li.textContent = item;
    } else {
      li.appendChild(item);
    }
    list.appendChild(li);
  }
  return list;
}

function makeInfoBlock(parts: Array<string | HTMLElement>): HTMLParagraphElement {
  const paragraph = el('p', 'info-copy');
  appendInline(paragraph, parts);
  return paragraph;
}

function makeInfoCard(id: string, title: string, content: HTMLElement[]): HTMLElement {
  const article = el('article', 'info-card');
  article.id = id;
  article.appendChild(el('h2', undefined, title));
  for (const block of content) {
    article.appendChild(block);
  }
  return article;
}

function makeKbd(text: string): HTMLElement {
  return el('kbd', 'key-cap', text);
}

const topbar = el('header', 'topbar');
const topbarInner = el('div', 'topbar-inner');
const brand = el('a', 'brand');
brand.href = '#';
brand.setAttribute('aria-label', 'CS Academy Graph Editor');
brand.appendChild(makeBrandMark());
const brandText = el('span', 'brand-text');
brandText.appendChild(el('span', 'brand-name', 'CS Academy'));
brandText.appendChild(el('span', 'brand-subtitle', 'Graph Editor'));
brand.appendChild(brandText);
const nav = el('nav', 'topnav');
const navGraph = el('a', 'active', 'Graph Editor');
navGraph.href = '#';
const navData = el('a', undefined, 'Data format');
navData.href = '#format';
const navShortcuts = el('a', undefined, 'Shortcuts');
navShortcuts.href = '#shortcuts';
nav.appendChild(navGraph);
nav.appendChild(navData);
nav.appendChild(navShortcuts);
const edition = el('span', 'edition-pill', 'Self-loop edition');
topbarInner.appendChild(brand);
topbarInner.appendChild(nav);
topbarInner.appendChild(edition);
topbar.appendChild(topbarInner);

const page = el('main', 'page');
const titlebar = el('section', 'titlebar');
const titleCopy = el('div', 'title-copy');
titleCopy.appendChild(el('h1', undefined, 'Graph Editor'));
titleCopy.appendChild(el('p', 'page-subtitle', 'Draw, edit, and export graphs. Self-loops are built in.'));
const titleActions = el('div', 'title-actions');
const saveStatus = el('span', 'save-status', 'Saved locally');
const undoButton = makeButton('Undo', 'btn btn-quiet btn-small', () => undo());
const redoButton = makeButton('Redo', 'btn btn-quiet btn-small', () => redo());
undoButton.disabled = true;
redoButton.disabled = true;
titleActions.appendChild(saveStatus);
titleActions.appendChild(undoButton);
titleActions.appendChild(redoButton);
titlebar.appendChild(titleCopy);
titlebar.appendChild(titleActions);

const editorGrid = el('section', 'editor-grid');

const leftPanel = el('aside', 'panel panel-left');
leftPanel.appendChild(el('div', 'panel-kicker', 'Graph setup'));
const directionControl = createSegmented(['Undirected', 'Directed'], 'Undirected', (value) => {
  changeDirection(value === 'Directed');
});
leftPanel.appendChild(directionControl.root);
leftPanel.appendChild(el('div', 'control-note', 'Undirected graphs share one edge per pair. Directed graphs keep both directions visible.'));

const nodeCountInput = el('input', 'text-input');
nodeCountInput.id = 'node-count';
nodeCountInput.readOnly = true;
nodeCountInput.setAttribute('aria-label', 'Node count');
leftPanel.appendChild(makeField('Node Count', nodeCountInput, 'Counted automatically from the graph data.'));

const dataBlock = el('div', 'field-block data-block');
const dataHead = el('div', 'field-head');
dataHead.appendChild(makeLabel('Graph Data', 'graph-data'));
const copyDataButton = makeButton('Copy', 'mini-button', () => {
  copyText(dataEditor.value).then(() => notify('Graph data copied.', 'success')).catch(showError);
});
dataHead.appendChild(copyDataButton);
dataBlock.appendChild(dataHead);
const dataEditor = el('textarea', 'data-editor');
dataEditor.id = 'graph-data';
dataEditor.spellcheck = false;
dataEditor.rows = 18;
dataEditor.setAttribute('aria-label', 'Graph data');
dataEditor.addEventListener('input', scheduleDataParse);
dataEditor.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    applyDataFromEditor();
  }
});
dataBlock.appendChild(dataEditor);
const dataSync = new GraphDataSync(dataEditor, model);
const dataHelp = el('div', 'data-help');
appendInline(dataHelp, ['Node: one token per line. Edge: ', makeCode('u v'), ' or ', makeCode('u v label'), '.']);
const selfLoopLine = el('div', 'data-help data-help-loop');
appendInline(selfLoopLine, ['Self-loop: ', makeCode('u u'), ' or ', makeCode('u u label'), '.']);
dataBlock.appendChild(dataHelp);
dataBlock.appendChild(selfLoopLine);
const parseMessage = el('div', 'inline-message');
dataBlock.appendChild(parseMessage);
leftPanel.appendChild(dataBlock);

const loopCallout = el('div', 'selfloop-callout');
loopCallout.appendChild(el('strong', undefined, 'Self-loops are first-class.'));
appendInline(loopCallout, [' Switch to Draw mode and click the same node twice, or type ', makeCode('u u'), ' in Graph Data.']);
leftPanel.appendChild(loopCallout);

const stagePanel = el('section', 'panel stage-panel');
const stageToolbar = el('div', 'stage-toolbar');
const indexControl = createSegmented(['0-index', '1-index', 'Custom Labels'], '0-index', (value) => {
  const indexMode: IndexMode = value === '0-index' ? '0' : value === '1-index' ? '1' : 'custom';
  changeIndexMode(indexMode);
});
stageToolbar.appendChild(indexControl.root);
const graphMeta = el('div', 'graph-meta');
stageToolbar.appendChild(graphMeta);
stagePanel.appendChild(stageToolbar);

const canvasWrap = el('div', 'canvas-wrap');
const graphSvg = document.createElementNS(SVG_NS, 'svg');
graphSvg.id = 'graph-svg';
graphSvg.setAttribute('role', 'img');
graphSvg.setAttribute('aria-label', 'Editable graph canvas');
const canvasOverlay = el('div', 'canvas-overlay');
canvasWrap.appendChild(graphSvg);
canvasWrap.appendChild(canvasOverlay);
stagePanel.appendChild(canvasWrap);

const stageFooter = el('div', 'stage-footer');
const modeHint = el('div', 'mode-hint');
const keyboardHint = el('div', 'keyboard-hint');
const keyboardBits: Array<string | HTMLElement> = [
  makeKbd('Esc'),
  ' cancel',
  '  ',
  makeKbd('Ctrl+Z'),
  ' undo',
  '  ',
  makeKbd('Ctrl+Shift+Z'),
  ' redo',
];
appendInline(keyboardHint, keyboardBits);
stageFooter.appendChild(modeHint);
stageFooter.appendChild(keyboardHint);
stagePanel.appendChild(stageFooter);

const rightPanel = el('aside', 'panel panel-right');
const modeControl = createSegmented(
  ['Force', 'Draw', 'Edit', 'Delete', 'Config'],
  'Force',
  (value) => setMode(value as ViewMode),
);
rightPanel.appendChild(modeControl.root);
const helpPanel = el('div', 'panel-content');
const configPanel = el('div', 'panel-content config-panel');
configPanel.hidden = true;
rightPanel.appendChild(helpPanel);
rightPanel.appendChild(configPanel);

const actionGroup = el('div', 'action-group');
const downloadPngButton = makeButton('Download as PNG', 'btn btn-info', () => exportPng());
const downloadSvgButton = makeButton('Download as SVG', 'btn btn-default', () => exportSvg());
actionGroup.appendChild(downloadPngButton);
actionGroup.appendChild(downloadSvgButton);
rightPanel.appendChild(actionGroup);
const exportNote = el('div', 'export-note');
appendInline(exportNote, ['PNG uses ', el('span', 'strong-text', model.settings.exportScale.toString() + 'x'), ' resolution. Change it in Config mode.']);
rightPanel.appendChild(exportNote);

editorGrid.appendChild(leftPanel);
editorGrid.appendChild(stagePanel);
editorGrid.appendChild(rightPanel);

const infoGrid = el('section', 'info-grid');
const dataInfo = makeInfoCard('format', 'Graph data format', [
  makeInfoBlock(['Each node is a single token. Each edge lists its two endpoints, then an optional label.']),
  makeList([
    makeInfoBlock([makeCode('0 1'), ' adds a normal edge.']),
    makeInfoBlock([makeCode('0 1 7'), ' adds the same edge with label 7.']),
    makeInfoBlock([makeCode('3 3'), ' adds a self-loop.']),
    makeInfoBlock([makeCode('3 3 back'), ' adds a labelled self-loop.']),
  ]),
]);
const loopInfo = makeInfoCard('self-loops', 'Self-loop support', [
  makeInfoBlock(['A self-loop is rendered outside the node, with its own curve and label space.']),
  makeList([
    'Directed mode adds an arrow at the loop endpoint.',
    'Multiple loops on one node fan out instead of overlapping.',
    'Draw mode creates a loop when you click the same node twice.',
    'Export to SVG keeps the loops as vector paths.',
  ]),
]);
const shortcutInfo = makeInfoCard('shortcuts', 'Quick reference', [
  makeList([
    makeInfoBlock(['Force: ', 'drag a node to move it, double-click to fix or unfix.']),
    makeInfoBlock(['Draw: ', 'click canvas for a node, click two nodes for an edge, click one node twice for a loop.']),
    makeInfoBlock(['Edit: ', 'click a node or edge label to rename it.']),
    makeInfoBlock(['Delete: ', 'click a node or edge to remove it.']),
    makeInfoBlock([makeKbd('Esc'), ' cancels the pending edge.']),
    makeInfoBlock([makeKbd('Ctrl+Z'), ' restores the previous graph state.']),
  ]),
]);
infoGrid.appendChild(dataInfo);
infoGrid.appendChild(loopInfo);
infoGrid.appendChild(shortcutInfo);

page.appendChild(titlebar);
page.appendChild(editorGrid);
page.appendChild(infoGrid);
app.appendChild(topbar);
app.appendChild(page);

interface ConfigRefs {
  nodeRadius: ReturnType<typeof makeRange>;
  idealEdge: ReturnType<typeof makeRange>;
  loopRadius: ReturnType<typeof makeRange>;
  loopSpacing: ReturnType<typeof makeRange>;
  nodeFill: HTMLSelectElement;
  nodeStroke: HTMLSelectElement;
  edgeColor: HTMLSelectElement;
  exportScale: HTMLSelectElement;
}

let configRefs: ConfigRefs | null = null;

function buildConfigPanel(): void {
  configPanel.replaceChildren();
  configPanel.appendChild(el('h3', undefined, 'Appearance'));
  const radius = makeRange('node-radius', 3, 30, model.settings.nodeRadius, (value) => {
    commitSettings({ nodeRadius: value });
  });
  configPanel.appendChild(makeField('Node radius', radius.wrapper));
  const ideal = makeRange('ideal-edge', 40, 240, model.settings.idealEdgeDistance, (value) => {
    commitSettings({ idealEdgeDistance: value });
  });
  configPanel.appendChild(makeField('Edge ideal length', ideal.wrapper));
  const loopRadius = makeRange('loop-radius', 16, 90, model.settings.loopRadius, (value) => {
    commitSettings({ loopRadius: value });
  });
  configPanel.appendChild(makeField('Self-loop radius', loopRadius.wrapper));
  const loopSpacing = makeRange('loop-spacing', 6, 40, model.settings.loopSpacing, (value) => {
    commitSettings({ loopSpacing: value });
  });
  configPanel.appendChild(makeField('Self-loop spacing', loopSpacing.wrapper));

  const nodeFill = makeSelect('node-fill', COLOR_OPTIONS, model.settings.nodeFill, (value) => {
    commitSettings({ nodeFill: value });
  });
  configPanel.appendChild(makeField('Node background', nodeFill));
  const nodeStroke = makeSelect('node-stroke', COLOR_OPTIONS, model.settings.nodeStroke, (value) => {
    commitSettings({ nodeStroke: value });
  });
  configPanel.appendChild(makeField('Node color', nodeStroke));
  const edgeColor = makeSelect('edge-color', COLOR_OPTIONS, model.settings.edgeColor, (value) => {
    commitSettings({ edgeColor: value });
  });
  configPanel.appendChild(makeField('Edge color', edgeColor));
  const exportScale = makeSelect(
    'export-scale',
    ['1', '2', '3', '4'],
    model.settings.exportScale.toString(),
    (value) => {
      commitSettings({ exportScale: Number(value) });
    },
  );
  configPanel.appendChild(makeField('PNG export scale', exportScale, 'Higher scales produce sharper PNG files.'));

  configPanel.appendChild(el('h3', undefined, 'Commands'));
  const commandRow = el('div', 'command-row');
  commandRow.appendChild(makeButton('Fix all', 'btn btn-quiet btn-small', () => {
    commitChange(() => model.setAllFixed(true));
  }));
  commandRow.appendChild(makeButton('Unfix all', 'btn btn-quiet btn-small', () => {
    commitChange(() => model.setAllFixed(false));
  }));
  configPanel.appendChild(commandRow);
  const commandRow2 = el('div', 'command-row');
  commandRow2.appendChild(makeButton('Arrange as tree', 'btn btn-default btn-small', () => {
    commitChange(() => model.arrangeTree());
    notify('Tree layout applied.', 'success');
  }));
  configPanel.appendChild(commandRow2);
  const commandRow3 = el('div', 'command-row');
  commandRow3.appendChild(makeButton('Reset example', 'btn btn-quiet btn-small', resetExample));
  commandRow3.appendChild(makeButton('Clear graph', 'btn btn-danger btn-small', clearGraph));
  configPanel.appendChild(commandRow3);

  configRefs = {
    nodeRadius: radius,
    idealEdge: ideal,
    loopRadius,
    loopSpacing,
    nodeFill,
    nodeStroke,
    edgeColor,
    exportScale,
  };
}

buildConfigPanel();
syncConfigValues();
updateControls();
renderHelp('Force');
updateModeHint();
updateHistoryButtons();
updateDataEditor();
updateMeta();

renderer = new GraphRenderer(graphSvg, canvasOverlay, model, {
  onNodeDragStart: handleNodeDragStart,
  onNodeDrag: handleNodeDrag,
  onNodeDragEnd: handleNodeDragEnd,
  onNodeToggleFixed: handleNodeToggleFixed,
  onNodeAddAt: handleNodeAddAt,
  onEdgeAdd: handleEdgeAdd,
  onNodeDelete: handleNodeDelete,
  onEdgeDelete: handleEdgeDelete,
  onNodeLabelChange: handleNodeLabelChange,
  onEdgeLabelChange: handleEdgeLabelChange,
});

const simulation = new ForceLayout(model, () => {
  renderer.render();
});
simulation.start();
scheduleSave();
window.addEventListener('resize', () => {
  renderer.render();
});

function scheduleDataParse(): void {
  if (dataTimer !== 0) {
    window.clearTimeout(dataTimer);
  }
  parseMessage.className = 'inline-message is-muted';
  parseMessage.textContent = 'Parsing...';
  dataTimer = window.setTimeout(() => {
    dataTimer = 0;
    applyDataFromEditor();
  }, 500);
}

function showParseIssues(issues: ParseIssue[], prefix: string): void {
  if (issues.length === 0) {
    parseMessage.className = 'inline-message';
    parseMessage.textContent = '';
    return;
  }
  const messages = issues.slice(0, 3).map((issue) => {
    return 'Line ' + issue.line + ': ' + issue.message;
  });
  const hasError = issues.some((issue) => issue.severity === 'error');
  parseMessage.className = 'inline-message ' + (hasError ? 'is-error' : 'is-warning');
  parseMessage.textContent = prefix + ' ' + messages.join(' ');
}

function applyDataFromEditor(): void {
  if (dataTimer !== 0) {
    window.clearTimeout(dataTimer);
    dataTimer = 0;
  }
  const before = model.snapshot();
  const result = model.parseData(dataEditor.value);
  if (!result.ok) {
    showParseIssues(result.issues, 'Data was not applied.');
    return;
  }
  if (JSON.stringify(before) !== JSON.stringify(model.snapshot())) {
    pushHistory(before);
    afterMutation('none');
  }
  const warnings = result.issues.filter((issue) => issue.severity === 'warning');
  if (warnings.length > 0) {
    showParseIssues(warnings, 'Applied with warnings.');
  } else {
    parseMessage.className = 'inline-message is-success';
    parseMessage.textContent = 'Graph data applied.';
  }
}

function changeDirection(directed: boolean): void {
  if (model.settings.directed === directed) {
    return;
  }
  commitChange(() => {
    model.setSettings({ directed });
  });
}

function changeIndexMode(indexMode: IndexMode): void {
  if (model.settings.indexMode === indexMode) {
    return;
  }
  commitChange(() => {
    model.renumber(indexMode);
  });
}

function setMode(nextMode: ViewMode): void {
  mode = nextMode;
  modeControl.setActive(nextMode);
  renderer.setMode(nextMode);
  renderHelp(nextMode);
  helpPanel.hidden = nextMode === 'Config';
  configPanel.hidden = nextMode !== 'Config';
  updateModeHint();
  if (isForceInteractive(nextMode)) {
    simulation.wake();
  } else {
    simulation.stop();
  }
}

function renderHelp(nextMode: ViewMode): void {
  helpPanel.replaceChildren();
  if (nextMode === 'Config') {
    return;
  }
  const titleMap: Record<ViewMode, string> = {
    Force: 'Force mode',
    Draw: 'Draw mode',
    Edit: 'Edit mode',
    Delete: 'Delete mode',
    Config: 'Config',
  };
  helpPanel.appendChild(el('h3', undefined, titleMap[nextMode]));
  if (isForceInteractive(nextMode)) {
    helpPanel.appendChild(makeInfoBlock(['A light force layout keeps the graph centered and readable.']));
    helpPanel.appendChild(makeList([
      'Drag and drop a node to move it.',
      'The node becomes fixed when the drag ends.',
      'Double-click a node to fix or unfix it.',
    ]));
  } else if (nextMode === 'Draw') {
    helpPanel.appendChild(makeInfoBlock(['Create nodes and edges directly on the canvas.']));
    helpPanel.appendChild(makeList([
      'Click empty canvas to add a node.',
      'Click a node, then another node, to add an edge.',
      'Click the same node twice to add a self-loop.',
      'Click empty canvas while drawing to cancel.',
    ]));
    const loopNotice = el('div', 'side-loop-notice');
    loopNotice.appendChild(el('strong', undefined, 'Self-loop tip'));
    appendInline(loopNotice, [' Click one node twice. The loop appears automatically outside the node.']);
    helpPanel.appendChild(loopNotice);
  } else if (nextMode === 'Edit') {
    helpPanel.appendChild(makeInfoBlock(['Rename nodes and edge labels without leaving the canvas.']));
    helpPanel.appendChild(makeList([
      'Click a node to edit its label.',
      'Click an edge or its label to edit the edge label.',
      'Press Enter to apply, or Escape to cancel.',
    ]));
  } else if (nextMode === 'Delete') {
    helpPanel.appendChild(makeInfoBlock(['Remove graph elements in one click.']));
    helpPanel.appendChild(makeList([
      'Click a node to delete it and its incident edges.',
      'Click a self-loop or any other edge to delete only that edge.',
      'Use Undo if you remove something by mistake.',
    ]));
  }
}

function updateModeHint(): void {
  const hints: Record<ViewMode, string> = {
    Force: 'Drag nodes to arrange the graph. Double-click a node to fix or unfix it.',
    Draw: 'Click empty canvas for a node. Click the same node twice for a self-loop.',
    Edit: 'Click a node or an edge label to rename it.',
    Delete: 'Click a node or edge to delete it.',
    Config: 'Adjust settings while the force layout stays interactive; drag nodes as in Force mode.',
  };
  modeHint.textContent = hints[mode];
  stagePanel.setAttribute('data-mode', mode);
}

function updateControls(): void {
  directionControl.setActive(model.settings.directed ? 'Directed' : 'Undirected');
  const indexValue = model.settings.indexMode === '1' ? '1-index' : model.settings.indexMode === 'custom' ? 'Custom Labels' : '0-index';
  indexControl.setActive(indexValue);
  modeControl.setActive(mode);
  nodeCountInput.value = model.nodes.length.toString();
}

function updateMeta(): void {
  const loopCount = model.edges.filter((edge) => edge.source === edge.target).length;
  const nodeWord = model.nodes.length === 1 ? ' node' : ' nodes';
  const edgeWord = model.edges.length === 1 ? ' edge' : ' edges';
  const loopWord = loopCount === 1 ? ' loop' : ' loops';
  graphMeta.textContent = model.nodes.length + nodeWord + ' · ' + model.edges.length + edgeWord + ' · ' + loopCount + loopWord;
}

function updateDataEditor(): void {
  dataSync.replaceAllFromModel();
}

function updateHistoryButtons(): void {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function updateExportNote(): void {
  exportNote.replaceChildren(
    document.createTextNode('PNG uses '),
    el('span', 'strong-text', model.settings.exportScale.toString() + 'x'),
    document.createTextNode(' resolution. Change it in Config mode.'),
  );
}

function syncConfigValues(): void {
  if (!configRefs) {
    return;
  }
  const setRange = (range: ReturnType<typeof makeRange>, value: number): void => {
    range.input.value = value.toString();
    range.output.textContent = value.toString();
  };
  setRange(configRefs.nodeRadius, model.settings.nodeRadius);
  setRange(configRefs.idealEdge, model.settings.idealEdgeDistance);
  setRange(configRefs.loopRadius, model.settings.loopRadius);
  setRange(configRefs.loopSpacing, model.settings.loopSpacing);
  configRefs.nodeFill.value = model.settings.nodeFill;
  configRefs.nodeStroke.value = model.settings.nodeStroke;
  configRefs.edgeColor.value = model.settings.edgeColor;
  configRefs.exportScale.value = model.settings.exportScale.toString();
  updateExportNote();
}

function pushHistory(snapshot: GraphSnapshot): void {
  undoStack.push(snapshot);
  if (undoStack.length > 100) {
    undoStack.shift();
  }
  redoStack = [];
  updateHistoryButtons();
}

function isForceInteractive(activeMode: ViewMode): boolean {
  return activeMode === 'Config' ? true : activeMode === 'Force';
}

function afterMutation(syncMode: string = 'full', before?: GraphSnapshot): void {
  renderer.render();
  updateControls();
  if (syncMode === 'full') {
    dataSync.replaceAllFromModel();
  } else if (syncMode === 'auto' && before) {
    dataSync.applyModelChange(before, model.snapshot());
  }
  updateMeta();
  syncConfigValues();
  updateHistoryButtons();
  if (isForceInteractive(mode)) {
    simulation.wake();
  }
  scheduleSave();
}

function commitChange(action: () => void): void {
  const before = model.snapshot();
  try {
    action();
  } catch (error) {
    model.restore(before);
    afterMutation('none');
    showError(error);
    return;
  }
  const after = model.snapshot();
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }
  pushHistory(before);
  afterMutation('auto', before);
}

function commitSettings(partial: Parameters<GraphModel['setSettings']>[0]): void {
  commitChange(() => {
    model.setSettings(partial);
  });
}

function undo(): void {
  const snapshot = undoStack.pop();
  if (!snapshot) {
    return;
  }
  const before = model.snapshot();
  redoStack.push(before);
  model.restore(snapshot);
  afterMutation('auto', before);
}

function redo(): void {
  const snapshot = redoStack.pop();
  if (!snapshot) {
    return;
  }
  const before = model.snapshot();
  undoStack.push(before);
  model.restore(snapshot);
  afterMutation('auto', before);
}

function resetExample(): void {
  commitChange(() => {
    model.restore(getDefaultSnapshot());
  });
  setMode('Force');
  notify('Default example restored.', 'success');
}

function clearGraph(): void {
  commitChange(() => {
    model.nodes = [];
    model.edges = [];
  });
  notify('Graph cleared. Undo is available.', 'info');
}

function scheduleSave(): void {
  if (saveTimer !== 0) {
    window.clearTimeout(saveTimer);
  }
  saveStatus.textContent = 'Saving...';
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model.snapshot()));
      saveStatus.textContent = 'Saved locally';
    } catch (error) {
      console.warn('Could not save the graph locally.', error);
      saveStatus.textContent = 'Not saved';
    }
  }, 280);
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function handleNodeDragStart(nodeId: string): void {
  dragBefore = model.snapshot();
  simulation.setDragging(nodeId);
}

function handleNodeDrag(nodeId: string, x: number, y: number): void {
  const node = model.getNode(nodeId);
  if (!node) {
    return;
  }
  const margin = Math.max(36, model.settings.nodeRadius + 14);
  node.x = clamp(x, margin, 760 - margin);
  node.y = clamp(y, margin, 560 - margin);
  renderer.render();
}

function handleNodeDragEnd(nodeId: string, moved: boolean): void {
  simulation.setDragging(null);
  const node = model.getNode(nodeId);
  if (node && moved) {
    if (dragBefore) {
      pushHistory(dragBefore);
    }
    afterMutation('none');
  }
  dragBefore = null;
}

function handleNodeToggleFixed(nodeId: string): void {
  const node = model.getNode(nodeId);
  if (!node) {
    return;
  }
  const willFix = !node.fixed;
  commitChange(() => {
    node.fixed = willFix;
  });
  notify('Node ' + node.label + (willFix ? ' fixed.' : ' unfixed.'), 'info');
}

function handleNodeAddAt(x: number, y: number): void {
  let label = '';
  commitChange(() => {
    const node = model.addNode(undefined, x, y, false);
    label = node.label;
  });
  if (label.length > 0) {
    notify('Node ' + label + ' added.', 'success');
  }
}

function handleEdgeAdd(sourceId: string, targetId: string): void {
  const source = model.getNode(sourceId);
  const target = model.getNode(targetId);
  if (!source || !target) {
    return;
  }
  commitChange(() => {
    model.addEdge(sourceId, targetId, '');
  });
  if (sourceId === targetId) {
    notify('Self-loop added to ' + source.label + '.', 'success');
  } else {
    notify('Edge ' + source.label + ' to ' + target.label + ' added.', 'success');
  }
}

function handleNodeDelete(nodeId: string): void {
  const node = model.getNode(nodeId);
  if (!node) {
    return;
  }
  const label = node.label;
  commitChange(() => {
    model.removeNode(nodeId);
  });
  notify('Node ' + label + ' deleted.', 'info');
}

function handleEdgeDelete(edgeId: string): void {
  const edge = model.getEdge(edgeId);
  if (!edge) {
    return;
  }
  const loop = edge.source === edge.target;
  commitChange(() => {
    model.removeEdge(edgeId);
  });
  notify(loop ? 'Self-loop deleted.' : 'Edge deleted.', 'info');
}

function handleNodeLabelChange(nodeId: string, label: string): void {
  commitChange(() => {
    model.setNodeLabel(nodeId, label);
  });
}

function handleEdgeLabelChange(edgeId: string, label: string): void {
  commitChange(() => {
    model.setEdgeLabel(edgeId, label);
  });
}

async function exportPng(): Promise<void> {
  renderer.hidePreview();
  renderer.render();
  try {
    await downloadPng(graphSvg, model.settings.exportScale, 'graph.png');
    notify('PNG downloaded at ' + model.settings.exportScale.toString() + 'x resolution.', 'success');
  } catch (error) {
    showError(error);
  }
}

function exportSvg(): void {
  renderer.hidePreview();
  renderer.render();
  downloadSvg(graphSvg, 'graph.svg');
  notify('SVG downloaded.', 'success');
}

window.addEventListener('keydown', (event: KeyboardEvent) => {
  const target = event.target;
  const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (editing) {
    return;
  }
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault();
    redo();
  }
});

updateDataEditor();
updateMeta();
updateControls();
updateHistoryButtons();
syncConfigValues();

setMode('Force');
notify('Graph Editor ready. Self-loops are enabled.', 'info');
