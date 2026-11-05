'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{parse}=require('../network/wifi_scan');
test('Wi-Fi scan lists visible SSIDs, preserves Unicode and keeps the strongest duplicate without BSSID data',()=>{
    const result=parse('BSS 00:11:22:33:44:55(on wlan0)\n freq: 2412\n signal: -79.50 dBm\n SSID: Test-Hotspot\n RSN:\n'+
        'BSS 00:11:22:33:44:66(on wlan0)\n freq: 5180\n signal: -42.00 dBm\n SSID: Test-Hotspot\n RSN:\n'+
        'BSS 00:11:22:33:44:77(on wlan0)\n freq: 2412\n signal: -64.00 dBm\n SSID: G\\xc3\\xa4ste\n'+
        'BSS 00:11:22:33:44:88(on wlan0)\n signal: -22.00 dBm\n SSID: \n');
    assert.deepEqual(result,[{ssid:'Test-Hotspot',signal:-42,secure:true,frequency:5180},{ssid:'Gäste',signal:-64,secure:false,frequency:2412}]);
    assert(!JSON.stringify(result).includes('00:11:22'));assert.deepEqual(parse('unavailable'),[]);
});
