/* START IMPORTS */
const { app, BrowserWindow, screen, globalShortcut, Menu, Tray } = require('electron')
const path = require('node:path')
const {default: SoundMixer, DeviceType} = require("native-sound-mixer");
const { ipcMain} = require('electron')
const { createConfigFile, loadConfigFile, openConfigFile } = require("./configManager");
// END IMPORTS //

/* START VARS */
const INCREASE_VALUE = 1,
DECREASE_VALUE = 1,
DEBUG = process.argv[2] && process.argv[2] === '-d';

var mainWindow,
allDevices = [],
SELECTED_DEVICE = "",
lastChange = 0,
changeTimeout,
multVal = 1,
WIDTH = 400,
HEIGHT = 500,
config;
/* END VARS */

/* START ELECTRON FUNCTIONS */
const createWindow = (sw, sh) => {
  if(DEBUG){
    WIDTH = 800
    HEIGHT = 800
  }
  const px = (sw / 2) - (WIDTH / 2)
  const py = 0

  mainWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    alwaysOnTop: true,
    roundedCorners: true,
    x: px,
    y: py,
    frame: DEBUG,
    transparent:true,
    resizable:DEBUG,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false, 
      preload: path.join(__dirname, "preload.js")
    }
  })
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setIgnoreMouseEvents(!DEBUG, { forward: true });
  mainWindow.setBackgroundMaterial("none")
  mainWindow.loadFile('index.html')
  if(DEBUG) mainWindow.webContents.openDevTools()
}

const trayInit = () => {
  let tray = new Tray('resources/app.asar/vontrol.png')
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Edit Config File', click: openConfigFile},
    { label: 'Exit', click: () => {app.exit(0)}},
  ])
  tray.setToolTip('Vontrol Menu')
  tray.setContextMenu(contextMenu)
}

const registerShortcuts = ()=>{
  // Previous Device
  globalShortcut.register(config.shortcuts.previousDevice, () => {
    var devices = getAllAudioDevices()
    for(let d = 0; d < devices.length; d++){
      var device = devices[d]
      if(device.selected){
        if(d != 0){
          SELECTED_DEVICE = extractDeviceName(devices[d - 1].name)
        }
        mainWindow.webContents.send("selected-update", SELECTED_DEVICE)
      }
    }
  })

  // Next Device
  globalShortcut.register(config.shortcuts.nextDeivce, () => {
    var devices = getAllAudioDevices()
    for(let d = 0; d < devices.length; d++){
      var device = devices[d]
      if(device.selected){
        if(d != devices.length - 1){
          SELECTED_DEVICE = extractDeviceName(devices[d + 1].name)
        }
        mainWindow.webContents.send("selected-update", SELECTED_DEVICE)
      }
    }
  })

  // Increase volume
  globalShortcut.register(config.shortcuts.increase, () => {
    var device = incVolume(SELECTED_DEVICE, INCREASE_VALUE)
    mainWindow.webContents.send("volume-update", device)
  })

  // Decrease volume
  globalShortcut.register(config.shortcuts.decrease, () => {
    var device = decVolume(SELECTED_DEVICE, DECREASE_VALUE)
    mainWindow.webContents.send("volume-update", device)
  })

  // Mute volume
  globalShortcut.register(config.shortcuts.mute, () => {
    var device = muteVolume(SELECTED_DEVICE)
    mainWindow.webContents.send("volume-update", device)
  })
}
/* END ELECTRON FUNCTIONS */

/* START EVENTS LISTNERS */
app.whenReady().then(() => {
  createConfigFile()
  config = loadConfigFile()
  trayInit()
  var default_dev = getDefaultAudioDevice()
  SELECTED_DEVICE = extractDeviceName(default_dev.name)
  allDevices = getAllAudioDevicesOnlyName()
  const displays = screen.getAllDisplays()
  const mainDisplay = displays.find((display) => {
    return display.bounds.x == 0 && display.bounds.y == 0
  })
  
  createWindow(mainDisplay.bounds.width, mainDisplay.bounds.height)

  registerShortcuts()

  setInterval(()=>{
      let newDevices = getAllAudioDevicesOnlyName()
      let diff = allDevices.differences(newDevices)

      for(let device of diff){
        if(allDevices.has(device)){
          // removed device
          if(SELECTED_DEVICE == device.name){ // FIXING BUG
            var default_dev = getDefaultAudioDevice()
            SELECTED_DEVICE = extractDeviceName(default_dev.name)
          }
          mainWindow.webContents.send("removed-device", device)
        }
        if(newDevices.has(device)){
          // added device
          mainWindow.webContents.send("new-device", device)
        }
      }
      allDevices = newDevices
  }, 500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

ipcMain.on('init', (event) => {
  mainWindow.webContents.send('devices-update', getAllAudioDevices())
})
/* END EVENTS LISTNERS */

/* START AUDIO FUNCTIONS */
const getAllAudioDevices = () => {
  var d = SoundMixer.devices.filter(dz => dz.type == DeviceType.RENDER && !config.blacklist.include(dz.name));
  let devices = []
  d.forEach(function(Device){
    let dev = {
      name: extractDeviceName(Device.name),
      volume: Device.volume,
      mute: Device.mute, type: extractDeviceType(Device.name),
      selected: SELECTED_DEVICE == extractDeviceName(Device.name)? true: false
    }
    devices.push(dev);
  });
  return devices; // Array of Device
}

const getAllAudioDevicesOnlyName = () => {
  var d = SoundMixer.devices.filter(dz => dz.type == DeviceType.RENDER && !config.blacklist.include(dz.name));
  let devices = []
  d.forEach(function(Device){
    let dev = {
      name: extractDeviceName(Device.name),
      type: extractDeviceType(Device.name)
    }
    devices.push(dev);
  });
  return devices; // Array of Device
}

const getAudioDeviceByName = (deviceName) => {
  var d = SoundMixer.devices.filter(dz => dz.type == DeviceType.RENDER && dz.name.includes(deviceName))[0];
  return d
}

const getDefaultAudioDevice = () => {
  var dev = SoundMixer.getDefaultDevice(DeviceType.RENDER);
  return dev; // Device
}

const incVolume = (device, value) => {
  var device = getAudioDeviceByName(device)
  if(new Date().getTime() - lastChange < 300){
    clearTimeout(changeTimeout)
    if(multVal < 5) multVal += 1 // max 5 
  }
  device.volume += ((value * multVal) / 100)
  lastChange = new Date().getTime()
  changeTimeout = setTimeout(()=>{
    multVal = 1
  }, 300)
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

const decVolume = (device, value) => {
  var device = getAudioDeviceByName(device)
  if(new Date().getTime() - lastChange < 300){
    clearTimeout(changeTimeout)
    if(multVal < 5) multVal += 1 // max 5 
  }
  device.volume -= ((value * multVal) / 100)
  lastChange = new Date().getTime()
  changeTimeout = setTimeout(()=>{
    multVal = 1
  }, 300)
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

const muteVolume = (device) => {
  var device = getAudioDeviceByName(device)
  device.mute = !device.mute
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

const getAudioDeviceDetailsByName = (device) => {
  var device = getAudioDeviceByName(device)
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

/* END AUDIO FUNCTIONS */

/* START UTILS FUNCTIONS */
const fillArray = (arr, count, fill=null) => {
  for(let i=0; i < count; i++){
    arr.push(fill)
  }
  return arr
}

const extractDeviceName = (text) => {
  const match = text.match(/\(([^)]+)\)/);
  return match ? match[1] : text;
}

const extractDeviceType = (text) => {
  const match = text.match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : "Speaker";
}
/* END UTILS FUNCTIONS */


/* START PROTOTYPE FUNCTION */
Object.prototype.include = function(searchString) {
  return this.some(value => searchString.includes(value));
};

Object.prototype.objectIndexOf = (param, searchString) => {
  for(let i = 0; i < this.length; i++){
    if(this[i][param] == searchString){
      return i
    }
  }
  return null
};

Object.prototype.differences = function(arr) {
  if(typeof arr != "object"){
    return []
  }

  arr = arr.slice().sort((a, b) => a.name.localeCompare(b.name))
  var arr2 = this.slice().sort((a, b) => a.name.localeCompare(b.name))

  const differences = [];

  if (arr.length !== arr2.length) {
    arr.length > arr2.length ? arr2=fillArray(arr2, arr.length - arr2.length) : arr=fillArray(arr, arr2.length - arr.length);
    //return differences;
  }

  for (let i = 0; i < arr.length; i++) {
    if (!JSON.stringify(arr2).includes(JSON.stringify(arr[i]))) {
        if(arr[i] != null){
          differences.push(arr[i]);
        }
    }
  }

  for (let i = 0; i < arr2.length; i++) {
    if (!JSON.stringify(arr).includes(JSON.stringify(arr2[i]))) {
        if(arr2[i] != null){
          differences.push(arr2[i]);
        }
    }
  }

  return differences
};

Object.prototype.has = function(obj) {
    return JSON.stringify(this).includes(JSON.stringify(obj))
};
/* END PROTOTYPE FUNCTION */