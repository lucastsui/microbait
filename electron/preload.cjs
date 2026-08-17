const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("microbait", {
  connectX: () => ipcRenderer.invoke("x:connect"),
  disconnectX: () => ipcRenderer.invoke("x:disconnect"),
  readFeed: () => ipcRenderer.invoke("x:feed"),
  openDrawer: (url) => ipcRenderer.invoke("drawer:open", url),
  setDrawerBounds: (box) => ipcRenderer.invoke("drawer:bounds", box),
  closeDrawer: () => ipcRenderer.invoke("drawer:close"),
  connectLinkedIn: () => ipcRenderer.invoke("linkedin:connect"),
  disconnectLinkedIn: () => ipcRenderer.invoke("linkedin:disconnect"),
  linkedInStatus: () => ipcRenderer.invoke("linkedin:status"),
});
