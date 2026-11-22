import {
  base64ToArrayBuffer,
  toByteString,
} from "@excalidraw/excalidraw/data/encode";

export const bytesToBase64 = (bytes: Uint8Array) =>
  window.btoa(toByteString(bytes));

export const base64ToBytes = (value: string) =>
  new Uint8Array(base64ToArrayBuffer(value));
