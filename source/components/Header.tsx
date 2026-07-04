import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import fs from 'fs';
import { execSync } from 'child_process';

const getBattery = (): string => {
  // Generic Linux/Android sysfs check (check multiple possible dirs)
  try {
    if (fs.existsSync('/sys/class/power_supply')) {
      const dirs = fs.readdirSync('/sys/class/power_supply');
      for (const dir of dirs) {
        if (dir.toLowerCase().includes('bat') || dir.toLowerCase().includes('bms') || dir.toLowerCase().includes('main')) {
          try {
            const capacity = fs.readFileSync(`/sys/class/power_supply/${dir}/capacity`, 'utf8').trim();
            if (capacity && !isNaN(Number(capacity))) return `${capacity}%`;
          } catch {}
        }
      }
    }
  } catch {}

  // Termux
  try {
    const raw = execSync('termux-battery-status', { encoding: 'utf8', timeout: 2000, stdio: 'pipe' });
    const data = JSON.parse(raw.toString());
    if (data && typeof data.percentage === 'number') {
      return `${data.percentage}%`;
    }
  } catch {}

  // Android dumpsys fallback
  try {
    const raw = execSync('dumpsys battery', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
    const match = raw.toString().match(/level:\s*(\d+)/);
    if (match) return `${match[1]}%`;
  } catch {}
  
  // Windows
  try {
    const raw = execSync('WMIC PATH Win32_Battery Get EstimatedChargeRemaining', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
    const lines = raw.toString().trim().split('\n');
    if (lines.length > 1 && lines[1]) {
        const pct = lines[1].trim();
        if (pct && !isNaN(Number(pct))) return `${pct}%`;
    }
  } catch {}
  
  // macOS
  try {
    const raw = execSync('pmset -g batt', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
    const match = raw.toString().match(/(\d+)%/);
    if (match) return `${match[1]}%`;
  } catch {}

  return 'N/A';
};

export const Header = () => {
  const [battery, setBattery] = useState('...');
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
    setBattery(getBattery());

    const timeInterval = setInterval(updateTime, 10000);
    const battInterval = setInterval(() => {
      setBattery(getBattery());
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

  let batteryDisplay = `BAT: ${battery}`;
  if (battery !== 'N/A' && battery !== '...') {
    const pct = parseInt(battery.replace('%', ''), 10);
    if (!isNaN(pct)) {
      batteryDisplay = `BAT: ${barGraph(pct, 10)} ${battery}`;
    }
  }

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold>GENESIS-OS v1.0</Text>
      <Text>{time} | {batteryDisplay} | STATUS: IDLE</Text>
    </Box>
  );
};
