import {parseWifiScanOutput} from './dist/app.js';
console.log(JSON.stringify(parseWifiScanOutput('[{"ssid":"HomeWiFi","level":-55,"auth":"WPA2"}]')));
