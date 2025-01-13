const { app, BrowserWindow, screen, globalShortcut } = require('electron')
const path = require('node:path')
const {default: SoundMixer, DeviceType, AudioSessionState} = require("native-sound-mixer");
const { ipcMain, ipcRenderer} = require('electron')

const BlackListed = ["Oculus", "AMD High Definition"]
var mainWindow
var allDevices = []
var SELECTED_DEVICE = ""
const INCREASE_VALUE = 3,
DECREASE_VALUE = 3

const createWindow = (sw, sh) => {
  const WIDTH = 400, HEIGHT = 300
  const px = (sw / 2) - (WIDTH / 2)
  const py = 0
  mainWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    alwaysOnTop: true,
    roundedCorners: true,
    x: px,
    y: py,
    frame: false,
    transparent:true,
    resizable:false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false, 
      preload: path.join(__dirname, "preload.js")
    }
  })
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setBackgroundMaterial("none")
  mainWindow.loadFile('index.html')
  //mainWindow.webContents.openDevTools()
}

app.whenReady().then(() => {
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
          //console.log(`[+] Removed Device: ${JSON.stringify(device)}`)
          mainWindow.webContents.send("removed-device", device)
        }
        if(newDevices.has(device)){
          // added device
          //console.log(`[+] Added Device: ${JSON.stringify(device)}`)
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

function getAllAudioDevices(){
  var d = SoundMixer.devices.filter(dz => dz.type == DeviceType.RENDER && !BlackListed.include(dz.name));
  let devices = []
  d.forEach(function(Device){
    let dev = {
      name: extractDeviceName(Device.name),
      volume: Device.volume,
      mute: Device.mute, type: extractDeviceType(Device.name)
    }
    devices.push(dev);
  });
  return devices; // Array of Device
}

function getAllAudioDevicesOnlyName(){
  var d = SoundMixer.devices.filter(dz => dz.type == DeviceType.RENDER && !BlackListed.include(dz.name));
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

function getAudioDeviceByName(deviceName){
  var d = SoundMixer.devices.filter(dz => dz.type == DeviceType.RENDER && dz.name.includes(deviceName))[0];
  return d
}

function getDefaultAudioDevice(){
  var dev = SoundMixer.getDefaultDevice(DeviceType.RENDER);
  return dev; // Device
}

function incVolume(device, value){
  var device = getAudioDeviceByName(device)
  device.volume += (value / 100)
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

function decVolume(device, value){
  var device = getAudioDeviceByName(device)
  device.volume -= (value / 100)
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

function muteVolume(device){
  var device = getAudioDeviceByName(device)
  device.mute = !device.mute
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

function getAudioDeviceDetailsByName(device){
  var device = getAudioDeviceByName(device)
  return {
    name: extractDeviceName(device.name),
    volume: device.volume,
    mute: device.mute, type: extractDeviceType(device.name)
  }
}

ipcMain.on('init', (event) => {
  mainWindow.webContents.send('device-update', getAudioDeviceDetailsByName(SELECTED_DEVICE))
})

const registerShortcuts = ()=>{
  // Next Device
  globalShortcut.register('CmdOrCtrl+Shift+[', () => {
    //console.log(`[+] Current Device: ${SELECTED_DEVICE}`)
    var devices = getAllAudioDevices()
    //console.log(`[+] Total Devices: ${JSON.stringify(devices)}`)
    var dIndex = devices.objectIndexOf("name", SELECTED_DEVICE)
    //console.log(`[+] Current index: ${dIndex}`)
    if(dIndex != 0){
      dIndex -= 1
    }
    //console.log(`[+] New index: ${dIndex}`)
    SELECTED_DEVICE = devices[dIndex].name
    mainWindow.webContents.send("device-update", devices[dIndex])
  })

  // Previous Device
  globalShortcut.register('CmdOrCtrl+Shift+]', () => {
    //console.log(`[+] Current Device: ${SELECTED_DEVICE}`)
    var devices = getAllAudioDevices()
    //console.log(`[+] Total Devices: ${JSON.stringify(devices)}`)
    var dIndex = devices.objectIndexOf("name", SELECTED_DEVICE)
    //console.log(`[+] Current index: ${dIndex}`)
    if(dIndex != devices.length - 1){
      dIndex += 1
    }
    //console.log(`[+] New index: ${dIndex}`)
    SELECTED_DEVICE = devices[dIndex].name
    mainWindow.webContents.send("device-update", devices[dIndex])
  })

  // Increase volume
  globalShortcut.register('CmdOrCtrl+Shift+p', () => {
    var device = incVolume(SELECTED_DEVICE, INCREASE_VALUE)
    mainWindow.webContents.send("volume-update", device)
  })

  // Decrease volume
  globalShortcut.register('CmdOrCtrl+Shift+o', () => {
    var device = decVolume(SELECTED_DEVICE, DECREASE_VALUE)
    mainWindow.webContents.send("volume-update", device)
  })

  // Mute volume
  globalShortcut.register('CmdOrCtrl+Shift+i', () => {
    var device = muteVolume(SELECTED_DEVICE)
    mainWindow.webContents.send("volume-update", device)
  })
}

Object.prototype.include = function (searchString) {
  return this.some(value => searchString.includes(value));
};

Object.prototype.objectIndexOf = function (param, searchString) {
  for(let i = 0; i < this.length; i++){
    if(this[i][param] == searchString){
      return i
    }
  }
  return -1
};

Object.prototype.differences = function (arr) {
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

Object.prototype.has = function (obj) {
    return JSON.stringify(this).includes(JSON.stringify(obj))
};

function fillArray(arr, count, fill=null){
  for(let i=0; i < count; i++){
    arr.push(fill)
  }
  return arr
}

function extractDeviceName(text) {
  const match = text.match(/\(([^)]+)\)/);
  return match ? match[1] : text;
}

function extractDeviceType(text) {
  const match = text.match(/^(.+?)\s*\(/);
  return match ? match[1].trim() : "Speaker";
}