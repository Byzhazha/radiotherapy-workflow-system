import { contextBridge } from 'electron';

const params = new URLSearchParams(globalThis.location?.search || '');

contextBridge.exposeInMainWorld('rtDesktop', {
  apiBaseUrl: params.get('api') || 'http://127.0.0.1:8750'
});
