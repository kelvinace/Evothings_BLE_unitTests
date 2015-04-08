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
        assert(deviceInfo.name.indexOf('HRM') == 0);

        connect(deviceInfo.address);
    });
}

function onConnect() {
    log("connected");
    serviceMap = serviceDiscovery(onServiceDiscovery);
}

function onServiceDiscovery(serviceMap) {
    // ensure all expected services are present
    assert(Object.keys(serviceMap).length <= 4); /* we could have the GAP and GATT services getting discovered as well. */
    // assert(serviceMap['00001800-0000-1000-8000-00805f9b34fb']); /* GAP service */
    // assert(serviceMap['00001801-0000-1000-8000-00805f9b34fb']); /* GATT service */
    assert(serviceMap['0000180a-0000-1000-8000-00805f9b34fb']); /* Device Information service */
    log("found device-information service");
    assert(serviceMap['0000180d-0000-1000-8000-00805f9b34fb']); /* heart rate service */
    log("found heart-rate service");

    // ensure the makeup of the Heart-rate service
    var serviceEntry = serviceMap['0000180d-0000-1000-8000-00805f9b34fb'];
    assert(Object.keys(serviceEntry['characteristics']).length == 3);
    assert(serviceEntry['characteristics']['00002a37-0000-1000-8000-00805f9b34fb']);
    log("found heart-rate measurement characteristic");
    assert(serviceEntry['characteristics']['00002a38-0000-1000-8000-00805f9b34fb']);
    log("found body-sensor-location characteristic");
    assert(serviceEntry['characteristics']['00002a39-0000-1000-8000-00805f9b34fb']);
    log("found control point characteristic");

    // attempt to read from the heart-rate-measurement characterisitc
    var heartRateMeasurementCharInfo = serviceEntry['characteristics']['00002a37-0000-1000-8000-00805f9b34fb']['info'];
    // log("heartRateMeasurementCharInfo.handle " + heartRateMeasurementCharInfo.handle);
    evothings.ble.readCharacteristic(deviceHandle, heartRateMeasurementCharInfo.handle, function(data) {
        var view = new DataView(data);
        var value = view.getUint16(0, false /* little-endian */);
        log('able to read heart-rate as ' + value);
    }, onError);

    // delay the following block by 1 second; that gives some time for the read-characteristic to execute.
    setTimeout(function() {
        // enable notifications on the characteristic
        evothings.ble.enableNotification(deviceHandle, heartRateMeasurementCharInfo.handle, function(data) {
            log('received notification data from heart-rate');
        }, onError);

        // disable notifications based on a timeout.
        setTimeout(function() {
            evothings.ble.disableNotification(deviceHandle, heartRateMeasurementCharInfo.handle, function(data) {
                log('disabled notification for heart-rate');
            }, onError);
        }, 2000);
    }, 1000);

    // end the test
    setTimeout(function() {
        disconnect();
        log('end');
    }, 4000);
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
