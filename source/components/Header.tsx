import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import fs from 'fs';
import { execSync } from 'child_process';

type BatteryInfo = { percent: number | null; charging: boolean | null; error: string | null };

const getBatteryInfo = (): BatteryInfo => {
  const info: BatteryInfo = { percent: null, charging: null, error: null };

  // 1. Termux
  try {
    const raw = execSync('termux-battery-status', { encoding: 'utf8', timeout: 2000, stdio: 'pipe' });
    const data = JSON.parse(raw.toString());
    if (data && typeof data.percentage === 'number') {
      info.percent = data.percentage;
      if (typeof data.status === 'string') {
        info.charging = data.status.toUpperCase() === 'CHARGING' || data.status.toUpperCase() === 'FULL';
      } else if (data.plugged) {
         info.charging = data.plugged !== 'UNPLUGGED';
      }
      return info;
    }
  } catch (e) {
    info.error = 'termux-api failed';
  }

  // 2. Generic Linux/Android sysfs
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

  // 3. Android dumpsys
  try {
    const raw = execSync('dumpsys battery', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
    const match = raw.toString().match(/level:\s*(\d+)/);
    if (match) {
      info.percent = parseInt(match[1]!, 10);
      const acMatch = raw.toString().match(/AC powered:\s*(true|false)/);
      const usbMatch = raw.toString().match(/USB powered:\s*(true|false)/);
      const wirelessMatch = raw.toString().match(/Wireless powered:\s*(true|false)/);
      const isAc = acMatch && acMatch[1] === 'true';
      const isUsb = usbMatch && usbMatch[1] === 'true';
      const isWireless = wirelessMatch && wirelessMatch[1] === 'true';
      info.charging = isAc || isUsb || isWireless;
      return info;
    }
  } catch {}
  
  // 4. Windows
  try {
    const raw = execSync('WMIC PATH Win32_Battery Get EstimatedChargeRemaining, BatteryStatus', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
    const lines = raw.toString().trim().split('\n');
    if (lines.length > 1 && lines[1]) {
        const parts = lines[1].trim().split(/\s+/);
        if (parts.length >= 2) {
            const status = parseInt(parts[0]!, 10);
            const pct = parseInt(parts[1]!, 10);
            if (!isNaN(pct)) {
                info.percent = pct;
                info.charging = status === 2;
                return info;
            }
        } else {
            const pct = parseInt(parts[0]!, 10);
            if (!isNaN(pct)) {
               info.percent = pct;
               return info;
            }
        }
    }
  } catch {}
  
  // 5. macOS
  try {
    const raw = execSync('pmset -g batt', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
    const match = raw.toString().match(/(\d+)%;\s*(charging|discharging|AC attached)/i);
    if (match) {
        info.percent = parseInt(match[1]!, 10);
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
