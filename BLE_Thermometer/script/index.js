// Use reference here:
// https://github.com/evothings/cordova-ble/blob/master/ble.js

// iOS style address
var iOSUuid = "9A8C";
// Android style address
var AndroidUuid = "FC:18:80:C7:F6:29";

// Device handle
var deviceHandle = null;

// Redirect console.log to Evothings Workbench
if (window.hyper && window.hyper.log) { console.log = hyper.log; }

// Log all messages to the screen and debug console
function log(message) {
    console.log(message);
    $('#results')[0].innerText += message + "\n";
}

function assert(condition, message) {
    if (!condition) {
        message = message || "Assertion failed";
        log("Assertion failure: " + message);
        if (typeof Error !== "undefined") {
            throw new Error(message);
        }
        throw message; // Fallback
    }
}

// When jQuery thinks we are ready
$(document).ready(function() {
    // Wait for ble stack to be ready
    if (window.evothings && window.evothings.ble) onReady();
    else document.addEventListener("deviceready", onReady);
});

function onReady() {
    log("BLE ready");

    scan(AndroidUuid, function(deviceInfo) {
        log("found device: " + deviceInfo.name);
        assert(deviceInfo.name === 'Therm');

        connect(deviceInfo.address);
    });
}

function onConnect() {
    log("connected");
    serviceMap = serviceDiscovery(onServiceDiscovery);
}

function onServiceDiscovery(serviceMap) {
    // log("count = " + serviceMap.length);

    assert(serviceMap['00001809-0000-1000-8000-00805f9b34fb']);
    assert(serviceMap['00001801-0000-1000-8000-00805f9b34fb']);
    assert(serviceMap['00001800-0000-1000-8000-00805f9b34fb']);
    log("done");
    // serviceMap.forEach(function(serviceEntry) {
    //     log("uuid: " + serviceEntry.uuid);
    // });
}

function onDisconnect() {
    log("disconnected");
}

function onError(message) {
    log("an error occurred: " + message);
}

// evothings abstraction............

function scan(uuid, callbackFn) {
    evothings.ble.stopScan();
    evothings.ble.startScan(function(deviceInfo) {
        if (deviceInfo.address.indexOf(uuid) === 0) {
            evothings.ble.stopScan();
            callbackFn(deviceInfo);
        }
    }, onError);
}

function connect(address) {
    evothings.ble.connect(address, function(connectInfo) {
        if (connectInfo.state === 0) { // Disconnected
            disconnect();
        } else if (connectInfo.state === 2) { // Connected
            deviceHandle = connectInfo.deviceHandle;
            onConnect();
        }
    }, onError);
}

function disconnect() {
    if (deviceHandle !== null) {
        evothings.ble.close(deviceHandle);
        deviceHandle = null;
    }
    onDisconnect();
}

function serviceDiscovery(callbackFn) {
    var serviceMap = [];
    evothings.ble.readAllServiceData(deviceHandle, function(services) {
        services.forEach(function(serviceInfo) {
            var serviceEntry = [];
            serviceEntry['info']            = serviceInfo;
            serviceEntry['characteristics'] = [];
            serviceInfo.characteristics.forEach(function(characteristicInfo) {
                var characteristicEntry = [];
                characteristicEntry['info'] = characteristicInfo;
                serviceEntry['characteristics'][characteristicInfo.uuid] = characteristicEntry;
            });
            serviceMap[serviceInfo.uuid] = serviceEntry;
        });
        callbackFn(serviceMap)
    }, onError);
}

function readCharacteristic(serviceUuid, charUuid, callbackFn) {
    evothings.ble.readAllServiceData(deviceHandle, function(services) {
        services.forEach(function(serviceInfo) {
            if (serviceInfo.uuid === serviceUuid) {
                serviceInfo.characteristics.forEach(function(characteristicInfo) {
                    if (characteristicInfo.uuid === charUuid) {
                        evothings.ble.readCharacteristic(deviceHandle, characteristicInfo.handle, function(data) {
                            callbackFn(data);
                        }, onError);
                    }
                });
            }
        });
    }, onError);
}
