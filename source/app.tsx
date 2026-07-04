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

// Fixed path access
const SETTINGS_FILE = path.join(process.env['HOME'] || '', '.jellybean_settings');

export default function App() {
  const {exit} = useApp();
  const [selected, setSelected] = useState(1);
  const [view, setView] = useState('main');
  const [palette, setPalette] = useState(() => {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        return fs.readFileSync(SETTINGS_FILE, 'utf8');
      }
    } catch (e) {
      return 'GPT';
    }
    return 'GPT';
  });

  const mainMenuItems = ['File Manager', 'System Stats', 'Settings', 'Exit'];
  const settingsItems = ['Palette: GPT', 'Palette: CLAUDE', 'Palette: SAKURA', 'Palette: ROSE', 'Palette: RAIN', 'Back'];

  const currentItems = view === 'main' ? mainMenuItems : settingsItems;
  const currentTheme = palettes[palette as keyof typeof palettes];

  const updatePalette = (newPalette: string) => {
    setPalette(newPalette);
    fs.writeFileSync(SETTINGS_FILE, newPalette);
  };

  useInput((_, key) => {
    if (key.upArrow && selected > 1) setSelected(selected - 1);
    if (key.downArrow && selected < currentItems.length) setSelected(selected + 1);

    if (key.return) {
      const selectedItem = currentItems[selected - 1];
      if (!selectedItem) return;

      if (view === 'main') {
        if (selectedItem === 'Settings') { setView('settings'); setSelected(1); }
        if (selectedItem === 'Exit') exit();
      } else {
        if (selectedItem.startsWith('Palette: ')) {
          updatePalette(selectedItem.replace('Palette: ', ''));
        }
        if (selectedItem === 'Back') { setView('main'); setSelected(1); }
      }
    }
  });

  return (
    <Box flexDirection="column" height={50} borderStyle="single" borderColor={currentTheme.primary}>
      <Header />
      <Box flexDirection="column" flexGrow={1} paddingY={5} paddingX={1}>
        {currentItems.map((item, index) => (
          <Text key={item} color={selected === index + 1 ? currentTheme.accent : 'white'}>
            {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" paddingX={1} borderColor={currentTheme.primary}>
        <Text color={currentTheme.accent}>
          Theme: {palette} | Selected: {currentItems[selected - 1] ?? ''}
        </Text>
      </Box>
    </Box>
  );
}