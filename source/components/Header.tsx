import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import fs from 'fs';
import { execSync } from 'child_process';

const getBattery = (): string => {
  try {
    const capacity = fs.readFileSync('/sys/class/power_supply/battery/capacity', 'utf8').trim();
    if (capacity) return `${capacity}%`;
  } catch {
    // Termux
    try {
      const raw = execSync('termux-battery-status', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
      const data = JSON.parse(raw.toString());
      if (data && typeof data.percentage === 'number') {
        return `${data.percentage}%`;
      }
    } catch {}
    
    // Windows
    try {
      const raw = execSync('WMIC PATH Win32_Battery Get EstimatedChargeRemaining', { encoding: 'utf8', timeout: 1000, stdio: 'pipe' });
      const lines = raw.toString().trim().split('\n');
      if (lines.length > 1) {
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
  }
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

  return (
    <Box borderStyle="single" paddingX={1} justifyContent="space-between">
      <Text bold>GENESIS-OS v1.0</Text>
      <Text>{time} | BAT: {battery} | STATUS: IDLE</Text>
    </Box>
  );
};
