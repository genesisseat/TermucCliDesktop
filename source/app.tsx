import React, {useState} from 'react';
import {Box, Text, useInput, useApp, useStdout} from 'ink';
import fs from 'fs';
import path from 'path';
import {Header} from './components/Header.js';

const palettes = {
  GPT: { primary: 'green', accent: 'cyan' },
  CLAUDE: { primary: 'orange', accent: 'yellow' },
  SAKURA: { primary: 'magenta', accent: 'red' },
  ROSE: { primary: 'red', accent: 'white' },
  RAIN: { primary: 'blue', accent: 'magenta' },
};

const HOME = process.env['HOME'] || process.cwd();
const SETTINGS_FILE = path.join(HOME, '.jellybean_settings');

const STORAGE_ROOT = fs.existsSync(path.join(HOME, 'storage', 'shared'))
  ? path.join(HOME, 'storage', 'shared')
  : HOME;

type FileEntry = { name: string; isDir: boolean };

function loadDirectory(dirPath: string): { entries: FileEntry[]; error: string | null } {
  try {
    const raw = fs.readdirSync(dirPath, { withFileTypes: true });
    const entries: FileEntry[] = raw
      .map((d) => {
        let isDir = d.isDirectory();
        if (d.isSymbolicLink()) {
          try { isDir = fs.statSync(path.join(dirPath, d.name)).isDirectory(); } catch { isDir = false; }
        }
        return { name: d.name, isDir };
      })
      .sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
    return { entries, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { entries: [], error: `Cannot read directory: ${message}` };
  }
}

// Truncate a string to fit maxLen, adding an ellipsis if cut off.
// Keeps the file extension visible where possible (e.g. "long-name-here....zip").
function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  if (maxLen <= 3) return name.slice(0, maxLen);

  const ext = path.extname(name);
  const hasUsableExt = ext.length > 0 && ext.length < maxLen - 4;

  if (hasUsableExt) {
    const keep = maxLen - ext.length - 3; // 3 chars for "..."
    return `${name.slice(0, keep)}...${ext}`;
  }
  return `${name.slice(0, maxLen - 3)}...`;
}

export default function App() {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState<'main' | 'settings' | 'files'>('main');

  const [palette, setPalette] = useState(() => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf8').trim();
        if (raw in palettes) return raw;
      }
    } catch {}
    return 'GPT';
  });

  const [currentPath, setCurrentPath] = useState(STORAGE_ROOT);
  const [dirState, setDirState] = useState(() => loadDirectory(STORAGE_ROOT));
  const [fileStatus, setFileStatus] = useState<string | null>(null);

  const mainMenuItems = ['File Manager', 'System Stats', 'Settings', 'Exit'];
  const settingsItems = ['Palette: GPT', 'Palette: CLAUDE', 'Palette: SAKURA', 'Palette: ROSE', 'Palette: RAIN', 'Back'];

  // Terminal width minus borders/padding (2 border chars + 2 padding = ~4),
  // minus the "> [ 99 ] " prefix (~10 chars), minus a small safety margin.
  const terminalWidth = stdout?.columns || 80;
  const prefixWidth = 10; // "> [ 99 ] " or "  [ 99 ] "
  const maxNameLength = Math.max(10, terminalWidth - prefixWidth - 4);

  const fileMenuItems = (() => {
    const items: string[] = [];
    if (currentPath !== path.parse(currentPath).root) items.push('.. (up)');
    for (const entry of dirState.entries) {
      const label = entry.isDir ? `[DIR] ${entry.name}` : entry.name;
      const truncated = entry.isDir
        ? `[DIR] ${truncateName(entry.name, maxNameLength - 6)}`
        : truncateName(entry.name, maxNameLength);
      items.push(truncated);
    }
    items.push('Back to Menu');
    return items;
  })();

  const currentItems =
    view === 'main' ? mainMenuItems : view === 'settings' ? settingsItems : fileMenuItems;

  const currentTheme = palettes[palette as keyof typeof palettes] ?? palettes.GPT;

  const updatePalette = (newPalette: string) => {
    setPalette(newPalette);
    try { fs.writeFileSync(SETTINGS_FILE, newPalette); } catch {}
  };

  const enterFileManager = () => {
    setView('files');
    setCurrentPath(STORAGE_ROOT);
    setDirState(loadDirectory(STORAGE_ROOT));
    setFileStatus(null);
    setSelected(1);
  };

  const navigateInto = (originalName: string) => {
    const nextPath = path.join(currentPath, originalName);
    const result = loadDirectory(nextPath);
    if (result.error) { setFileStatus(result.error); return; }
    setCurrentPath(nextPath);
    setDirState(result);
    setFileStatus(null);
    setSelected(1);
  };

  const navigateUp = () => {
    const parent = path.dirname(currentPath);
    const result = loadDirectory(parent);
    setCurrentPath(parent);
    setDirState(result);
    setFileStatus(result.error);
    setSelected(1);
  };

  const inspectFile = (originalName: string) => {
    try {
      const stats = fs.statSync(path.join(currentPath, originalName));
      const kb = (stats.size / 1024).toFixed(1);
      setFileStatus(`${truncateName(originalName, maxNameLength)} — ${kb} KB — modified ${stats.mtime.toLocaleDateString()}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setFileStatus(`Cannot read file: ${message}`);
    }
  };

  useInput((_, key) => {
    if (key.upArrow && selected > 1) setSelected(selected - 1);
    if (key.downArrow && selected < currentItems.length) setSelected(selected + 1);

    if (key.return) {
      const selectedIndex = selected - 1;
      const selectedLabel = currentItems[selectedIndex];
      if (!selectedLabel) return;

      if (view === 'main') {
        if (selectedLabel === 'File Manager') enterFileManager();
        if (selectedLabel === 'Settings') { setView('settings'); setSelected(1); }
        if (selectedLabel === 'Exit') exit();
      } else if (view === 'settings') {
        if (selectedLabel.startsWith('Palette: ')) updatePalette(selectedLabel.replace('Palette: ', ''));
        if (selectedLabel === 'Back') { setView('main'); setSelected(1); }
      } else if (view === 'files') {
        // Use the ORIGINAL (untruncated) entry, not the display label, for filesystem ops.
        const hasUpRow = currentPath !== path.parse(currentPath).root;
        if (selectedLabel === 'Back to Menu') {
          setView('main'); setFileStatus(null); setSelected(1);
        } else if (selectedLabel === '.. (up)') {
          navigateUp();
        } else {
          const entryIndex = hasUpRow ? selectedIndex - 1 : selectedIndex;
          const entry = dirState.entries[entryIndex];
          if (!entry) return;
          if (entry.isDir) navigateInto(entry.name);
          else inspectFile(entry.name);
        }
      }
    }

    if (view === 'files' && key.backspace) navigateUp();
  });

  return (
    <Box flexDirection="column" height={50} borderStyle="single" borderColor={currentTheme.primary}>
      <Header />
      {view === 'files' && (
        <Box paddingX={1}>
          <Text color={currentTheme.primary}>{truncateName(currentPath, maxNameLength + 6)}</Text>
        </Box>
      )}
      <Box flexDirection="column" flexGrow={1} paddingY={view === 'files' ? 1 : 5} paddingX={1}>
        {dirState.error && view === 'files' && <Text color="red">{dirState.error}</Text>}
        {currentItems.map((item, index) => (
          <Text key={`${item}-${index}`} wrap="truncate-end" color={selected === index + 1 ? currentTheme.accent : 'white'}>
            {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" paddingX={1} borderColor={currentTheme.primary}>
        <Text wrap="truncate-end" color={currentTheme.accent}>
          {view === 'files' && fileStatus
            ? fileStatus
            : `Theme: ${palette} | Selected: ${currentItems[selected - 1] ?? ''}`}
        </Text>
      </Box>
    </Box>
  );
}