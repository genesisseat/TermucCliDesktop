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

type DiskInfo = { mount: string; sizeKb: number; usedKb: number; availKb: number; usePercent: number };

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
      const sizeKb = parts[1];
      const usedKb = parts[2];
      const availKb = parts[3];
      const useStr = parts[4];
      const mount = parts.slice(5).join(' ');
      if (!mount) continue;

      const isRelevant =
        mount === '/' || mount.includes('/storage') || mount.includes('/sdcard') || mount.includes(HOME);

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

function readCpuModel(): string {
  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const lines = cpuinfo.split('\n');
    const modelLine = lines.find(l => l.toLowerCase().startsWith('model name'));
    if (modelLine) { const v = modelLine.split(':')[1]?.trim(); if (v) return v; }
    const hardwareLine = lines.find(l => l.toLowerCase().startsWith('hardware'));
    if (hardwareLine) { const v = hardwareLine.split(':')[1]?.trim(); if (v) return v; }
    const processorLine = lines.find(l => l.toLowerCase().startsWith('processor'));
    if (processorLine) { const v = processorLine.split(':')[1]?.trim(); if (v) return v; }
  } catch {
    // /proc/cpuinfo unreadable — fall through to getprop
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
    if (total !== null && available !== null) return { totalKb: total, availableKb: available };
  } catch {
    // /proc/meminfo unreadable — fall through
  }
  return { totalKb: os.totalmem() / 1024, availableKb: os.freemem() / 1024 };
}

type SystemSnapshot = {
  totalMemKb: number; freeMemKb: number; cpuModel: string; cpuCores: number;
  loadAvg: number[]; uptimeSec: number; disks: DiskInfo[]; diskError: string | null;
};

function loadSystemSnapshot(): SystemSnapshot {
  const { disks, error: diskError } = loadDiskInfo();
  const { totalKb, availableKb } = readMemInfo();
  const cpus = os.cpus();
  return {
    totalMemKb: totalKb, freeMemKb: availableKb, cpuModel: readCpuModel(),
    cpuCores: cpus.length, loadAvg: os.loadavg(), uptimeSec: os.uptime(), disks, diskError,
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

// --- Task Manager helpers ---------------------------------------------------

type ProcessInfo = { pid: string; user: string; cpu: string; mem: string; command: string };

function parsePsAux(raw: string): ProcessInfo[] {
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const header = lines[0];
  if (lines.length < 2 || !header) return [];

  const cols = ['USER', 'PID', '%CPU', '%MEM', 'COMMAND'];
  const positions = cols.map((c) => header.indexOf(c));
  if (positions.some((p) => p === -1)) return [];

  const [posUser, posPid, posCpu, posMem, posCmd] = positions;
  if (
    posUser === undefined ||
    posPid === undefined ||
    posCpu === undefined ||
    posMem === undefined ||
    posCmd === undefined
  ) {
    return [];
  }

  const processes: ProcessInfo[] = [];
  for (const line of lines.slice(1)) {
    if (line.length < posPid) continue;
    const user = line.slice(posUser, posPid).trim();
    const pid = line.slice(posPid, posCpu).trim();
    const cpu = line.slice(posCpu, posMem).trim();
    const mem = line.slice(posMem, posCmd).trim();
    const command = line.slice(posCmd).trim();
    if (!pid) continue;
    processes.push({ user, pid, cpu, mem, command });
  }

  // Busiest first — most useful when hunting for something to kill.
  return processes.sort((a, b) => parseFloat(b.cpu) - parseFloat(a.cpu));
}

function loadProcesses(): { processes: ProcessInfo[]; error: string | null } {
  try {
    const raw = execSync('ps aux', { encoding: 'utf8', timeout: 3000 });
    const processes = parsePsAux(raw);
    if (processes.length === 0) {
      return { processes: [], error: 'No processes parsed — try "pkg install procps" for full ps support' };
    }
    return { processes, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { processes: [], error: `ps unavailable: ${message}` };
  }
}

function killProcess(pid: string): { success: boolean; message: string } {
  try {
    execSync(`kill -9 ${pid}`, { encoding: 'utf8', timeout: 2000 });
    return { success: true, message: `Sent kill signal to PID ${pid}` };
  } catch {
    // Most common real-world cause: the process belongs to another app's UID —
    // Android's sandboxing blocks this without root.
    return { success: false, message: `Could not kill PID ${pid}: permission denied or already exited` };
  }
}

// --- App Launcher helpers ---------------------------------------------------

type LaunchableApp = { name: string; package: string };

const LAUNCHABLE_APPS: LaunchableApp[] = [
  { name: 'Chrome', package: 'com.android.chrome' },
  { name: 'Camera', package: 'com.android.camera2' },
  { name: 'Settings', package: 'com.android.settings' },
  { name: 'Phone / Dialer', package: 'com.android.dialer' },
  { name: 'Messages', package: 'com.google.android.apps.messaging' },
  { name: 'Photos', package: 'com.google.android.apps.photos' },
  { name: 'Play Store', package: 'com.android.vending' },
  { name: 'Maps', package: 'com.google.android.apps.maps' },
  { name: 'Gmail', package: 'com.google.android.gm' },
  { name: 'YouTube', package: 'com.google.android.youtube' },
];

// Only ever called with hardcoded packages above, but validated anyway in case
// this list grows to accept user-entered package names later — a raw string
// interpolated into a shell command is a command-injection risk otherwise.
function isValidPackageName(pkg: string): boolean {
  return /^[a-zA-Z0-9_.]+$/.test(pkg);
}

function launchApp(pkg: string): { success: boolean; message: string } {
  if (!isValidPackageName(pkg)) {
    return { success: false, message: 'Invalid package name' };
  }
  try {
    const result = execSync(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`, {
      encoding: 'utf8',
      timeout: 4000,
    });
    if (/no activities found/i.test(result)) {
      return { success: false, message: `${pkg} is not installed` };
    }
    return { success: true, message: `Launched ${pkg}` };
  } catch {
    return { success: false, message: `Failed to launch ${pkg} — may not be installed` };
  }
}

// ---------------------------------------------------------------------------

type View = 'main' | 'settings' | 'files' | 'stats' | 'tasks' | 'launcher';

export default function App() {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState<View>('main');

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

  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);

  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processError, setProcessError] = useState<string | null>(null);
  const [pendingKill, setPendingKill] = useState<ProcessInfo | null>(null);
  const [taskStatus, setTaskStatus] = useState<string | null>(null);

  const [launcherStatus, setLauncherStatus] = useState<string | null>(null);

  useEffect(() => {
    if (view !== 'stats') return;
    setSnapshot(loadSystemSnapshot());
    const interval = setInterval(() => setSnapshot(loadSystemSnapshot()), 2000);
    return () => clearInterval(interval);
  }, [view]);

  // Pause auto-refresh while a kill confirmation is pending so the list
  // (and the row you're pointing at) doesn't shift underneath you.
  useEffect(() => {
    if (view !== 'tasks' || pendingKill) return;
    const refresh = () => {
      const { processes: procs, error } = loadProcesses();
      setProcesses(procs);
      setProcessError(error);
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [view, pendingKill]);

  const mainMenuItems = ['File Manager', 'System Stats', 'Task Manager', 'App Launcher', 'Settings', 'Exit'];
  // Generated from `palettes` so every theme you add automatically appears here.
  const settingsItems = [...Object.keys(palettes).map((name) => `Palette: ${name}`), 'Back'];
  const statsMenuItems = ['Back to Menu'];
  const launcherItems = [...LAUNCHABLE_APPS.map((a) => a.name), 'Back to Menu'];

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

  const taskMenuItems = (() => {
    if (pendingKill) {
      return [`Confirm: kill PID ${pendingKill.pid} (${truncateName(pendingKill.command, 20)})`, 'Cancel'];
    }
    const rows = processes
      .slice(0, 60) // cap the list — pagination would be needed for very busy systems
      .map((p) =>
        truncateName(`${p.pid.padEnd(6)} ${p.cpu.padStart(5)}% ${p.mem.padStart(5)}%  ${p.command}`, maxNameLength)
      );
    return [...rows, 'Refresh', 'Back to Menu'];
  })();

  const currentItems =
    view === 'main' ? mainMenuItems :
    view === 'settings' ? settingsItems :
    view === 'stats' ? statsMenuItems :
    view === 'tasks' ? taskMenuItems :
    view === 'launcher' ? launcherItems :
    fileMenuItems;

  const currentTheme = palettes[palette as keyof typeof palettes] ?? palettes.GPT;

  const updatePalette = (newPalette: string) => {
    setPalette(newPalette);
    try { fs.writeFileSync(SETTINGS_FILE, newPalette); } catch {
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

  const enterStats = () => {
    setView('stats');
    setSnapshot(loadSystemSnapshot());
    setSelected(1);
  };

  const enterTasks = () => {
    setView('tasks');
    setPendingKill(null);
    setTaskStatus(null);
    const { processes: procs, error } = loadProcesses();
    setProcesses(procs);
    setProcessError(error);
    setSelected(1);
  };

  const enterLauncher = () => {
    setView('launcher');
    setLauncherStatus(null);
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
        if (selectedLabel === 'Task Manager') enterTasks();
        if (selectedLabel === 'App Launcher') enterLauncher();
        if (selectedLabel === 'Settings') { setView('settings'); setSelected(1); }
        if (selectedLabel === 'Exit') exit();
      } else if (view === 'settings') {
        if (selectedLabel.startsWith('Palette: ')) updatePalette(selectedLabel.replace('Palette: ', ''));
        if (selectedLabel === 'Back') { setView('main'); setSelected(1); }
      } else if (view === 'stats') {
        if (selectedLabel === 'Back to Menu') { setView('main'); setSelected(1); }
      } else if (view === 'tasks') {
        if (pendingKill) {
          if (selectedLabel.startsWith('Confirm:')) {
            const result = killProcess(pendingKill.pid);
            setTaskStatus(result.message);
            setPendingKill(null);
            const { processes: procs, error } = loadProcesses();
            setProcesses(procs);
            setProcessError(error);
          } else if (selectedLabel === 'Cancel') {
            setPendingKill(null);
            setTaskStatus(null);
          }
          setSelected(1);
        } else if (selectedLabel === 'Back to Menu') {
          setView('main');
          setSelected(1);
        } else if (selectedLabel === 'Refresh') {
          const { processes: procs, error } = loadProcesses();
          setProcesses(procs);
          setProcessError(error);
        } else {
          const proc = processes[selectedIndex];
          if (proc) { setPendingKill(proc); setSelected(1); }
        }
      } else if (view === 'launcher') {
        if (selectedLabel === 'Back to Menu') {
          setView('main');
          setSelected(1);
        } else {
          const app = LAUNCHABLE_APPS.find((a) => a.name === selectedLabel);
          if (app) {
            const result = launchApp(app.package);
            setLauncherStatus(result.message);
          }
        }
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
    // Escape backs out of a pending kill confirmation without needing to arrow down to Cancel.
    if (view === 'tasks' && pendingKill && key.escape) {
      setPendingKill(null);
      setSelected(1);
    }
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
      ) : view === 'tasks' ? (
        <Box flexDirection="column" flexGrow={1} paddingY={1} paddingX={1}>
          {!pendingKill && (
            <Text color={currentTheme.primary} bold>
              {'PID'.padEnd(7)}{'CPU%'.padStart(5)}  {'MEM%'.padStart(5)}  COMMAND
            </Text>
          )}
          {processError && <Text color="red">{processError}</Text>}
          {taskMenuItems.map((item, index) => (
            <Text key={`${item}-${index}`} wrap="truncate-end" color={selected === index + 1 ? currentTheme.accent : 'white'}>
              {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
            </Text>
          ))}
        </Box>
      ) : view === 'launcher' ? (
        <Box flexDirection="column" flexGrow={1} paddingY={2} paddingX={1}>
          {launcherItems.map((item, index) => (
            <Text key={`${item}-${index}`} wrap="truncate-end" color={selected === index + 1 ? currentTheme.accent : 'white'}>
              {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
            </Text>
          ))}
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
            : view === 'tasks'
            ? (taskStatus ?? (pendingKill ? 'Press Esc to cancel' : 'Live — refreshes every 3s'))
            : view === 'launcher'
            ? (launcherStatus ?? 'Select an app to launch it')
            : `Theme: ${palette} | Selected: ${currentItems[selected - 1] ?? ''}`}
        </Text>
      </Box>
    </Box>
  );
}