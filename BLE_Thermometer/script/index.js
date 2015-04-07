// Use reference here:
// https://github.com/evothings/cordova-ble/blob/master/ble.js

// You'll need to update the following based on the target device. device UUID
// may be discovered on iOS using 'lightBlue', or on Android using 'nRF Master
// Control Panel'.
var iOSUuid = "9A8C";                  // iOS style address
var AndroidUuid = "FC:18:80:C7:F6:29"; // Android style address

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

    scan(iOSUuid, function(deviceInfo) {
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
    // log("onScanDiscovery");

    // ensure all expected services are present
    assert(Object.keys(serviceMap).length <= 3); /* we could have the GAP and GATT services getting discovered as well. */
    // assert(serviceMap['00001800-0000-1000-8000-00805f9b34fb']); /* GAP service */
    // assert(serviceMap['00001801-0000-1000-8000-00805f9b34fb']); /* GATT service */
    assert(serviceMap['00001809-0000-1000-8000-00805f9b34fb']); /* health thermometer */
    log("found health thermometer service");

    // ensure the makeup of the HealthThermometer service
    var serviceEntry = serviceMap['00001809-0000-1000-8000-00805f9b34fb'];
    assert(Object.keys(serviceEntry['characteristics']).length == 2);
    assert(serviceEntry['characteristics']['00002a1c-0000-1000-8000-00805f9b34fb']);
    log("found temperature measurement characteristic");
    assert(serviceEntry['characteristics']['00002a1d-0000-1000-8000-00805f9b34fb']);
    log("found temperature type characteristic");

    // attempt to read from the temperature-measurement characterisitc from the health-thermometer service
    var temperatureMeasurementCharInfo = serviceEntry['characteristics']['00002a1c-0000-1000-8000-00805f9b34fb']['info'];
    evothings.ble.readCharacteristic(deviceHandle, temperatureMeasurementCharInfo.handle, function(data) {
        log('able to read temperature');
    }, onError);

    // enable notifications on the characteristic
    evothings.ble.enableNotification(deviceHandle, temperatureMeasurementCharInfo.handle, function(data) {
        log('received notification data from temperature');
    }, onError);

    // disable notifications based on a timeout.
    setTimeout(function() {
        evothings.ble.disableNotification(deviceHandle, temperatureMeasurementCharInfo.handle, function(data) {
            log('disabled notification for temperature');
        }, onError);
    }, 2000);

    // end the test
    setTimeout(function() {
        disconnect();
        log('end');
    }, 3000);
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
            // log("serviceInfo.uuid " + serviceInfo.uuid);
            var serviceEntry = [];
            serviceEntry['info']            = serviceInfo;
            serviceEntry['characteristics'] = [];
            serviceInfo.characteristics.forEach(function(characteristicInfo) {
                // log("serviceDiscovery: characteristics UUID: " + characteristicInfo.uuid);
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
