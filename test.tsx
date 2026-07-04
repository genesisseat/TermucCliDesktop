import test from 'ava';
import {parseBatteryJsonOutput, parseDumpsysBatteryOutput} from './source/components/Header.js';

test('parses termux battery JSON with charging status', t => {
	const parsed = parseBatteryJsonOutput('{"percentage": 78, "status": "CHARGING"}');

	t.deepEqual(parsed, {percent: 78, charging: true, error: null});
});

test('parses android dumpsys battery output', t => {
	const parsed = parseDumpsysBatteryOutput('Battery Status:\n  level: 42\n  AC powered: true');

	t.deepEqual(parsed, {percent: 42, charging: true, error: null});
});
