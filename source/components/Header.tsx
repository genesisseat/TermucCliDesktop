import React from 'react';
import {Box, Text} from 'ink';

export const Header = () => (
  <Box borderStyle="single" paddingX={1} justifyContent="space-between">
    <Text bold>GENESIS-OS v1.0</Text>
    <Text>03:28 AM | STATUS: IDLE</Text>
  </Box>
);
