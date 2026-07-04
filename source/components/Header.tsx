import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import fs from 'fs';
import { execFileSync, execSync } from 'child_process';

type BatteryInfo = { percent: number | null; charging: boolean | null; error: string | null };

export const parseBatteryJsonOutput = (raw: string): BatteryInfo | null => {
  try {
    const data = JSON.parse(raw.trim()) as Record<string, unknown>;
    const percentage = typeof data['percentage'] === 'number'
      ? data['percentage']
      : typeof data['percent'] === 'number'
        ? data['percent']
        : typeof data['level'] === 'number'
          ? data['level']
          : null;

    if (percentage === null) {
      return null;
    }

    const statusValue = typeof data['status'] === 'string' ? data['status'].toLowerCase() : '';
    const pluggedValue = typeof data['plugged'] === 'string' ? data['plugged'].toLowerCase() : '';
    const charging = statusValue === 'charging' || statusValue === 'full' || statusValue === 'charging_ac' || statusValue === 'charging_usb' || statusValue === 'charging_wireless' || pluggedValue === 'true' || pluggedValue === '1' || pluggedValue === 'ac' || pluggedValue === 'usb' || pluggedValue === 'wireless' || data['plugged'] === true || data['charging'] === true || data['isCharging'] === true;

    return {percent: percentage, charging, error: null};
  } catch {
    return null;
  }
};

export const parseDumpsysBatteryOutput = (raw: string): BatteryInfo | null => {
  const match = raw.match(/level:\s*(\d+)/i);
  if (!match) {
    return null;
  }

  const percent = Number.parseInt(match[1]!, 10);
  const acMatch = raw.match(/AC powered:\s*(true|false)/i);
  const usbMatch = raw.match(/USB powered:\s*(true|false)/i);
  const wirelessMatch = raw.match(/Wireless powered:\s*(true|false)/i);
  const charging = (acMatch?.[1] ?? '').toLowerCase() === 'true' || (usbMatch?.[1] ?? '').toLowerCase() === 'true' || (wirelessMatch?.[1] ?? '').toLowerCase() === 'true';

  return {percent, charging, error: null};
};

const getBatteryInfo = (): BatteryInfo => {
  const info: BatteryInfo = { percent: null, charging: null, error: null };

  // 1. Termux
  try {
    const raw = execFileSync('termux-battery-status', {encoding: 'utf8', timeout: 2000, stdio: 'pipe'});
    const parsed = parseBatteryJsonOutput(raw.toString());
    if (parsed) {
      return parsed;
    }
  } catch {
    info.error = 'termux-api failed';
  }

  // 2. Android dumpsys
  try {
    const raw = execFileSync('dumpsys', ['battery'], {encoding: 'utf8', timeout: 1000, stdio: 'pipe'});
    const parsed = parseDumpsysBatteryOutput(raw.toString());
    if (parsed) {
      return parsed;
    }
  } catch {}

  // 3. Generic Linux/Android sysfs
  try {
    if (fs.existsSync('/sys/class/power_supply')) {
      const dirs = fs.readdirSync('/sys/class/power_supply');
      for (const dir of dirs) {
        if (dir.toLowerCase().includes('bat') || dir.toLowerCase().includes('bms') || dir.toLowerCase().includes('main')) {
          try {
            const capStr = fs.readFileSync(`/sys/class/power_supply/${dir}/capacity`, 'utf8').trim();
            const cap = parseInt(capStr, 10);
            if (!isNaN(cap)) {
              info.percent = cap;
              try {
                const statusStr = fs.readFileSync(`/sys/class/power_supply/${dir}/status`, 'utf8').trim().toLowerCase();
                info.charging = statusStr === 'charging' || statusStr === 'full';
              } catch {}
              return info;
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 4. Android-specific battery status command
  try {
    const raw = execFileSync('cmd', ['battery', 'status'], {encoding: 'utf8', timeout: 1000, stdio: 'pipe'});
    const line = raw.toString().split('\n').find(line => line.includes('level'));
    if (line) {
      const match = line.match(/level:\s*(\d+)/i);
      if (match) {
        info.percent = Number.parseInt(match[1]!, 10);
      }

      const isCharging = /status:\s*(charging|full)/i.test(line);
      if (isCharging) {
        info.charging = true;
      }

      if (info.percent !== null) {
        return info;
      }
    }
  } catch {}

  // 5. Windows
  try {
    const raw = execSync('WMIC PATH Win32_Battery Get EstimatedChargeRemaining, BatteryStatus', {encoding: 'utf8', timeout: 1000, stdio: 'pipe'});
    const lines = raw.toString().trim().split('\n');
    if (lines.length > 1 && lines[1]) {
      const parts = lines[1].trim().split(/\s+/);
      if (parts.length >= 2) {
        const status = Number.parseInt(parts[0]!, 10);
        const pct = Number.parseInt(parts[1]!, 10);
        if (!Number.isNaN(pct)) {
          info.percent = pct;
          info.charging = status === 2;
          return info;
        }
      } else {
        const pct = Number.parseInt(parts[0]!, 10);
        if (!Number.isNaN(pct)) {
          info.percent = pct;
          return info;
        }
      }
    }
  } catch {}

  // 6. macOS
  try {
    const raw = execSync('pmset -g batt', {encoding: 'utf8', timeout: 1000, stdio: 'pipe'});
    const match = raw.toString().match(/(\d+)%\s*(charging|discharging|AC attached)/i);
    if (match) {
      info.percent = Number.parseInt(match[1]!, 10);
      info.charging = match[2]!.toLowerCase().includes('charging') || match[2]!.toLowerCase().includes('ac');
      return info;
    }
  } catch {}

  return info;
};

export const Header = () => {
  const [batteryInfo, setBatteryInfo] = useState<BatteryInfo>({ percent: null, charging: null, error: null });
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setTime(`${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`);
    };
    
    updateTime();
    setBatteryInfo(getBatteryInfo());

    const timeInterval = setInterval(updateTime, 10000);
    const battInterval = setInterval(() => {
      setBatteryInfo(getBatteryInfo());
    }, 60000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(battInterval);
    };
  }, []);

  function barGraph(percent: number, width: number): string {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  }

  let batteryDisplay = `BAT: N/A`;
  if (batteryInfo.percent !== null) {
    const icon = batteryInfo.charging ? '⚡' : '';
    batteryDisplay = `BAT: ${icon}${barGraph(batteryInfo.percent, 10)} ${batteryInfo.percent}%`;
  } else if (batteryInfo.error === 'termux-api failed') {
    batteryDisplay = `BAT: ERR (pkg install termux-api?)`;
  }

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold>GENESIS-OS v1.0</Text>
      <Text>{time} | {batteryDisplay} | STATUS: IDLE</Text>
    </Box>
  );
};
