import test from 'ava';
import {parseBatteryJsonOutput, parseDumpsysBatteryOutput} from './source/components/Header.js';
import {parseWifiScanOutput} from './source/app.js';

test('parses termux battery JSON with charging status', t => {
	const parsed = parseBatteryJsonOutput('{"percentage": 78, "status": "CHARGING"}');

	t.deepEqual(parsed, {percent: 78, charging: true, error: null});
});

test('parses android dumpsys battery output', t => {
	const parsed = parseDumpsysBatteryOutput('Battery Status:\n  level: 42\n  AC powered: true');

	t.deepEqual(parsed, {percent: 42, charging: true, error: null});
});

test('parses wifi scan output into a list of networks', t => {
	const parsed = parseWifiScanOutput('[{"ssid":"HomeWiFi","level":-55,"auth":"WPA2"}]');

	t.deepEqual(parsed, [{ssid: 'HomeWiFi', level: -55, auth: 'WPA2'}]);
});
