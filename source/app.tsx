import React, {useState} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {Header} from './components/Header.js';

export default function App() {
  const {stdout} = useStdout();
  const [selected, setSelected] = useState(1);
  const menuItems = ['File Manager', 'System Stats', 'Terminal Log', 'Settings'];

  // Calculate dynamic height based on terminal rows
  const containerHeight = stdout ? Math.max(15, stdout.rows - 2) : 15;

  useInput((_, key) => {
    if (key.upArrow && selected > 1) setSelected(selected - 1);
    if (key.downArrow && selected < menuItems.length) setSelected(selected + 1);
  });

  return (
    <Box flexDirection="column" height={containerHeight} borderStyle="single" borderColor="gray">
      <Header />
      <Box flexDirection="column" flexGrow={1} paddingY={2} paddingX={1}>
        {menuItems.map((item, index) => (
          <Text key={item} color={selected === index + 1 ? 'cyan' : 'white'}>
            {selected === index + 1 ? '> ' : '  '} [ {index + 1} ] {item}
          </Text>
        ))}
      </Box>
      <Box borderStyle="single" paddingX={1}>
        <Text>Selected: {menuItems[selected - 1]}</Text>
      </Box>
    </Box>
  );
}