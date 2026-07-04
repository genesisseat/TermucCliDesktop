import React from 'react';
import {Box, Text} from 'ink';

export const AppGrid = () => (
  <Box flexDirection="column" flexGrow={1} padding={1}>
    <Text>[ 1 ] File Manager</Text>
    <Text>[ 2 ] System Stats</Text>
    <Text>[ 3 ] Terminal Log</Text>
    <Text>[ 4 ] Settings</Text>
  </Box>
);
