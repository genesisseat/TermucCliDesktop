import React, {useState} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
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

// Termux exposes phone storage here after `termux-setup-storage` is run once.
// Fall back to HOME if that symlink doesn't exist yet (e.g. permission not granted).
const STORAGE_ROOT = fs.existsSync(path.join(HOME, 'storage', 'shared'))
  ? path.join(HOME, 'storage', 'shared')
  : HOME;

type FileEntry = {
  name: string;
  isDir: boolean;
};

function loadDirectory(dirPath: string): { entries: FileEntry[]; error: string | null } {
  try {
    const raw = fs.readdirSync(dirPath, { withFileTypes: true });
    const entries: FileEntry[] = raw
      .map((d) => {
        let isDir = d.isDirectory();
        // Follow symlinks (Termux storage entries are often symlinks)
        if (d.isSymbolicLink()) {
          try {
            isDir = fs.statSync(path.join(dirPath, d.name)).isDirectory();
          } catch {
            isDir = false;
          }
        }
        return { name: d.name, isDir };
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return { entries, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { entries: [], error: `Cannot read directory: ${message}` };
  }
}

export default function App() {
  const {exit} = useApp();
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState<'main' | 'settings' | 'files'>('main');

  const [palette, setPalette] = useState(() => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf8').trim();
        if (raw in palettes) return raw;
      }
    } catch {
      // fall through to default
    }
    return 'GPT';
  });

  const [currentPath, setCurrentPath] = useState(STORAGE_ROOT);
  const [dirState, setDirState] = useState(() => loadDirectory(STORAGE_ROOT));
  const [fileStatus, setFileStatus] = useState<string | null>(null);

  const mainMenuItems = ['File Manager', 'System Stats', 'Settings', 'Exit'];
  const settingsItems = ['Palette: GPT', 'Palette: CLAUDE', 'Palette: SAKURA', 'Palette: ROSE', 'Palette: RAIN', 'Back'];

  const fileMenuItems = (() => {
    const items: string[] = [];
    if (currentPath !== path.parse(currentPath).root) items.push('.. (up)');
    for (const entry of dirState.entries) {
      items.push(entry.isDir ? `[DIR]  ${entry.name}` : `       ${entry.name}`);
    }
    items.push('Back to Menu');
    return items;
  })();

  const currentItems =
    view === 'main' ? mainMenuItems : view === 'settings' ? settingsItems : fileMenuItems;

  const currentTheme = palettes[palette as keyof typeof palettes] ?? palettes.GPT;

  const updatePalette = (newPalette: string) => {
    setPalette(newPalette);
    try {
      fs.writeFileSync(SETTINGS_FILE, newPalette);
    } catch {
      // Non-fatal: theme still applies for this session even if it can't be saved.
    }
  };

  const enterFileManager = () => {
    setView('files');
    setCurrentPath(STORAGE_ROOT);
    setDirState(loadDirectory(STORAGE_ROOT));
    setFileStatus(null);
    setSelected(1);
  };

  const navigateInto = (name: string) => {
    const nextPath = path.join(currentPath, name);
    const result = loadDirectory(nextPath);
    if (result.error) {
      setFileStatus(result.error);
      return; // stay put, just show the error
    }
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

  const inspectFile = (name: string) => {
    try {
      const stats = fs.statSync(path.join(currentPath, name));
      const kb = (stats.size / 1024).toFixed(1);
      setFileStatus(`${name} — ${kb} KB — modified ${stats.mtime.toLocaleDateString()}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      setFileStatus(`Cannot read file: ${message}`);
    }
  };

  useInput((_, key) => {
    if (key.upArrow && selected > 1) setSelected(selected - 1);
    if (key.downArrow && selected < currentItems.length) setSelected(selected + 1);

    if (key.return) {
      const selectedItem = currentItems[selected - 1];
      if (!selectedItem) return;

      if (view === 'main') {
        if (selectedItem === 'File Manager') enterFileManager();
        if (selectedItem === 'Settings') { setView('settings'); setSelected(1); }
        if (selectedItem === 'Exit') exit();
      } else if (view === 'settings') {
        if (selectedItem.startsWith('Palette: ')) {
          updatePalette(selectedItem.replace('Palette: ', ''));
        }
        if (selectedItem === 'Back') { setView('main'); setSelected(1); }
      } else if (view === 'files') {
        if (selectedItem === 'Back to Menu') {
          setView('main');
          setFileStatus(null);
          setSelected(3); // land back on "Settings" position isn't guaranteed; reset to top instead
          setSelected(1);
        } else if (selectedItem === '.. (up)') {
          navigateUp();
        } else if (selectedItem.startsWith('[DIR]')) {
          navigateInto(selectedItem.replace('[DIR]  ', ''));
        } else {
          inspectFile(selectedItem.replace(/^\s+/, ''));
        }
      }
    }

    // Backspace as a quick "go up" shortcut while browsing
    if (view === 'files' && key.backspace) {
      navigateUp();
    }
  });

  return (
    <Box flexDirection="column" height={50} borderStyle="single" borderColor={currentTheme.primary}>
      <Header />
      {view === 'files' && (
        <Box paddingX={1}>
          <Text color={currentTheme.primary}>{currentPath}</Text>
        </Box>
      )}
      <Box flexDirection="column" flexGrow={1} paddingY={view === 'files' ? 1 : 5} paddingX={1}>
        {dirState.error && view === 'files' && (
          <Text color="red">{dirState.error}</Text>
        )}
        {currentItems.map((item, index) => (
          <Text key={`${item}-${index}`} color={selected === index + 1 ? currentTheme.accent : 'white'}>
            {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" paddingX={1} borderColor={currentTheme.primary}>
        <Text color={currentTheme.accent}>
          {view === 'files' && fileStatus
            ? fileStatus
            : `Theme: ${palette} | Selected: ${currentItems[selected - 1] ?? ''}`}
        </Text>
      </Box>
    </Box>
  );
}