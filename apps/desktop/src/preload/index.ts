import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("sparta", {
  version: "0.1.0",
  realtimeAssistance: false
});
