import React, {useState, useEffect} from 'react';
import {Box, Text, useInput, useApp, useStdout} from 'ink';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {execSync} from 'child_process';
import {Header} from './components/Header.js';

const palettes = {
  GPT:     { primary: '#10A37F', accent: '#00D9C0' },
  CLAUDE:  { primary: '#DA7756', accent: '#F0C674' },
  SAKURA:  { primary: '#FF6FA5', accent: '#FFD6E8' },
  ROSE:    { primary: '#E8384F', accent: '#FFB6C1' },
  RAIN:    { primary: '#4A90D9', accent: '#8FD3FE' },
  MATRIX:  { primary: '#00FF41', accent: '#003B00' },
  MIDNIGHT:{ primary: '#5C6BC0', accent: '#B39DDB' },
  SUNSET:  { primary: '#FF7E5F', accent: '#FEB47B' },
  MONO:    { primary: '#CCCCCC', accent: '#FFFFFF' },
  AMBER:   { primary: '#FFB000', accent: '#664400' },
  CYBER:   { primary: '#F72585', accent: '#4CC9F0' },
  FOREST:  { primary: '#2D6A4F', accent: '#95D5B2' },
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

function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  if (maxLen <= 3) return name.slice(0, maxLen);
  const ext = path.extname(name);
  const hasUsableExt = ext.length > 0 && ext.length < maxLen - 4;
  if (hasUsableExt) {
    const keep = maxLen - ext.length - 3;
    return `${name.slice(0, keep)}...${ext}`;
  }
  return `${name.slice(0, maxLen - 3)}...`;
}

// --- System stats helpers -------------------------------------------------

type DiskInfo = {
  mount: string;
  sizeKb: number;
  usedKb: number;
  availKb: number;
  usePercent: number;
};

function formatBytes(kb: number): string {
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(1)} GB`;
  return `${(gb / 1024).toFixed(2)} TB`;
}

function loadDiskInfo(): { disks: DiskInfo[]; error: string | null } {
  try {
    const raw = execSync('df -Pk', { encoding: 'utf8', timeout: 3000 });
    const lines = raw.trim().split('\n').slice(1);

    const disks: DiskInfo[] = [];
    const seenMounts = new Set<string>();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const [, sizeKb, usedKb, availKb, useStr, ...mountParts] = parts;
      const mount = mountParts.join(' ');

      const isRelevant =
        mount === '/' ||
        mount.includes('/storage') ||
        mount.includes('/sdcard') ||
        mount.includes(HOME);

      if (!isRelevant || seenMounts.has(mount)) continue;
      seenMounts.add(mount);

      disks.push({
        mount,
        sizeKb: Number(sizeKb) || 0,
        usedKb: Number(usedKb) || 0,
        availKb: Number(availKb) || 0,
        usePercent: Number((useStr || '0').replace('%', '')) || 0,
      });
    }

    return { disks, error: disks.length ? null : 'No storage volumes detected' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { disks: [], error: `df unavailable: ${message}` };
  }
}

// --- CPU model detection (Android/Termux-safe) ----------------------------

function readCpuModel(): string {
  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const lines = cpuinfo.split('\n');

    const modelLine = lines.find(l => l.toLowerCase().startsWith('model name'));
    if (modelLine) {
      const value = modelLine.split(':')[1]?.trim();
      if (value) return value;
    }

    const hardwareLine = lines.find(l => l.toLowerCase().startsWith('hardware'));
    if (hardwareLine) {
      const value = hardwareLine.split(':')[1]?.trim();
      if (value) return value;
    }

    const processorLine = lines.find(l => l.toLowerCase().startsWith('processor'));
    if (processorLine) {
      const value = processorLine.split(':')[1]?.trim();
      if (value) return value;
    }
  } catch {
    // /proc/cpuinfo unreadable — fall through
  }

  const propKeys = ['ro.soc.model', 'ro.board.platform', 'ro.product.board', 'ro.hardware'];
  for (const key of propKeys) {
    try {
      const value = execSync(`getprop ${key}`, { encoding: 'utf8', timeout: 2000 }).trim();
      if (value) return value;
    } catch {
      // getprop not available or key empty — try next
    }
  }

  return 'Unknown CPU';
}

// --- Memory detection (Android/Termux-safe) --------------------------------

function readMemInfo(): { totalKb: number; availableKb: number } {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const lines = meminfo.split('\n');

    const getValueKb = (label: string): number | null => {
      const line = lines.find(l => l.startsWith(label));
      if (!line) return null;
      const match = line.match(/(\d+)/);
      return match ? Number(match[1]) : null;
    };

    const total = getValueKb('MemTotal:');
    const available = getValueKb('MemAvailable:') ?? getValueKb('MemFree:');

    if (total !== null && available !== null) {
      return { totalKb: total, availableKb: available };
    }
  } catch {
    // /proc/meminfo unreadable — fall through
  }

  return { totalKb: os.totalmem() / 1024, availableKb: os.freemem() / 1024 };
}

type SystemSnapshot = {
  totalMemKb: number;
  freeMemKb: number;
  cpuModel: string;
  cpuCores: number;
  loadAvg: number[];
  uptimeSec: number;
  disks: DiskInfo[];
  diskError: string | null;
};

function loadSystemSnapshot(): SystemSnapshot {
  const { disks, error: diskError } = loadDiskInfo();
  const { totalKb, availableKb } = readMemInfo();
  const cpus = os.cpus();

  return {
    totalMemKb: totalKb,
    freeMemKb: availableKb,
    cpuModel: readCpuModel(),
    cpuCores: cpus.length,
    loadAvg: os.loadavg(),
    uptimeSec: os.uptime(),
    disks,
    diskError,
  };
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function barGraph(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

// ---------------------------------------------------------------------------

export default function App() {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState<'main' | 'settings' | 'files' | 'stats'>('main');

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

  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);

  useEffect(() => {
    if (view !== 'stats') return;
    setSnapshot(loadSystemSnapshot());
    const interval = setInterval(() => setSnapshot(loadSystemSnapshot()), 2000);
    return () => clearInterval(interval);
  }, [view]);

  const mainMenuItems = ['File Manager', 'System Stats', 'Settings', 'Exit'];
  // Generated from `palettes` so every theme you add automatically appears here.
  const settingsItems = [...Object.keys(palettes).map((name) => `Palette: ${name}`), 'Back'];
  const statsMenuItems = ['Back to Menu'];

  const terminalWidth = stdout?.columns || 80;
  const prefixWidth = 10;
  const maxNameLength = Math.max(10, terminalWidth - prefixWidth - 4);

  const fileMenuItems = (() => {
    const items: string[] = [];
    if (currentPath !== path.parse(currentPath).root) items.push('.. (up)');
    for (const entry of dirState.entries) {
      const truncated = entry.isDir
        ? `[DIR] ${truncateName(entry.name, maxNameLength - 6)}`
        : truncateName(entry.name, maxNameLength);
      items.push(truncated);
    }
    items.push('Back to Menu');
    return items;
  })();

  const currentItems =
    view === 'main' ? mainMenuItems :
    view === 'settings' ? settingsItems :
    view === 'stats' ? statsMenuItems :
    fileMenuItems;

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

  const enterStats = () => {
    setView('stats');
    setSnapshot(loadSystemSnapshot());
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
        if (selectedLabel === 'System Stats') enterStats();
        if (selectedLabel === 'Settings') { setView('settings'); setSelected(1); }
        if (selectedLabel === 'Exit') exit();
      } else if (view === 'settings') {
        if (selectedLabel.startsWith('Palette: ')) updatePalette(selectedLabel.replace('Palette: ', ''));
        if (selectedLabel === 'Back') { setView('main'); setSelected(1); }
      } else if (view === 'stats') {
        if (selectedLabel === 'Back to Menu') { setView('main'); setSelected(1); }
      } else if (view === 'files') {
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

  const barWidth = Math.max(10, Math.min(30, terminalWidth - 40));

  return (
    <Box flexDirection="column" height={50} borderStyle="single" borderColor={currentTheme.primary}>
      <Header />

      {view === 'files' && (
        <Box paddingX={1}>
          <Text color={currentTheme.primary}>{truncateName(currentPath, maxNameLength + 6)}</Text>
        </Box>
      )}

      {view === 'stats' ? (
        <Box flexDirection="column" flexGrow={1} paddingY={1} paddingX={1}>
          {!snapshot ? (
            <Text color={currentTheme.accent}>Loading system info…</Text>
          ) : (
            <>
              <Text color={currentTheme.primary} bold>CPU</Text>
              <Text>  {truncateName(snapshot.cpuModel, maxNameLength)}</Text>
              <Text>  Cores: {snapshot.cpuCores}   Load avg (1/5/15m): {snapshot.loadAvg.map(n => n.toFixed(2)).join(' / ')}</Text>
              <Text>  Uptime: {formatUptime(snapshot.uptimeSec)}</Text>

              <Box marginTop={1}>
                <Text color={currentTheme.primary} bold>RAM</Text>
              </Box>
              {(() => {
                const usedKb = snapshot.totalMemKb - snapshot.freeMemKb;
                const pct = snapshot.totalMemKb > 0 ? (usedKb / snapshot.totalMemKb) * 100 : 0;
                return (
                  <>
                    <Text>
                      {'  '}
                      <Text color={currentTheme.accent}>{barGraph(pct, barWidth)}</Text>
                      {`  ${pct.toFixed(0)}%`}
                    </Text>
                    <Text>  {formatBytes(usedKb)} used / {formatBytes(snapshot.totalMemKb)} total</Text>
                  </>
                );
              })()}

              <Box marginTop={1}>
                <Text color={currentTheme.primary} bold>Storage</Text>
              </Box>
              {snapshot.diskError && (
                <Text color="red">  {snapshot.diskError}</Text>
              )}
              {snapshot.disks.map((disk) => (
                <Box key={disk.mount} flexDirection="column" marginBottom={1}>
                  <Text>  {truncateName(disk.mount, maxNameLength)}</Text>
                  <Text>
                    {'  '}
                    <Text color={currentTheme.accent}>{barGraph(disk.usePercent, barWidth)}</Text>
                    {`  ${disk.usePercent}%`}
                  </Text>
                  <Text>    {formatBytes(disk.usedKb)} used / {formatBytes(disk.sizeKb)} total ({formatBytes(disk.availKb)} free)</Text>
                </Box>
              ))}
            </>
          )}
          <Box marginTop={1}>
            <Text color={selected === 1 ? currentTheme.accent : 'white'}>
              {selected === 1 ? '> ' : '  '} [ 1 ] Back to Menu
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" flexGrow={1} paddingY={view === 'files' ? 1 : 5} paddingX={1}>
          {dirState.error && view === 'files' && <Text color="red">{dirState.error}</Text>}
          {currentItems.map((item, index) => (
            <Text key={`${item}-${index}`} wrap="truncate-end" color={selected === index + 1 ? currentTheme.accent : 'white'}>
              {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
            </Text>
          ))}
        </Box>
      )}

      <Box borderStyle="single" paddingX={1} borderColor={currentTheme.primary}>
        <Text wrap="truncate-end" color={currentTheme.accent}>
          {view === 'files' && fileStatus
            ? fileStatus
            : view === 'stats'
            ? 'Live — refreshes every 2s'
            : `Theme: ${palette} | Selected: ${currentItems[selected - 1] ?? ''}`}
        </Text>
      </Box>
    </Box>
  );
}