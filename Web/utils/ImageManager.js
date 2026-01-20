"use client";

import axios from "axios";
import { AuthManager } from "./AuthManager.js";

export class ImageManager {
  constructor() {
    /* ------------ CONFIG ------------ */
    this.projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    this.apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    /* ------------ STATE ------------ */
    this.organisationName = null;
    this.privateIP = null;
    this.db=null;
  }

  /* ------------ SETTERS ------------ */
  setOrganisation(name) {
    this.organisationName = name;
  }

  setPrivateIP(ip) {
    this.privateIP = ip;
  }

  /* ------------ IMAGE ID ------------ */
  generateImageId(userId) {
    const ts = Date.now().toString().slice(-6);
    return `${userId}${ts}`;
  }

  parseImageId(imageId) {
    return {
      userId: imageId.slice(0, -6),
      version: imageId.slice(-6),
    };
  }

  /* ------------ IMAGE COMPRESS ------------ */
  async imageCompresser(file, croppedAreaPixels) {
    const SIZE = 256;
    const QUALITY = 0.45;
    const TYPE = "image/webp";

    const imageBitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;

    const ctx = canvas.getContext("2d");

    const { x, y, width, height } = croppedAreaPixels;

    ctx.drawImage(
      imageBitmap,
      x,
      y,
      width,
      height,   // actual crop chosen by user
      0,
      0,
      SIZE,
      SIZE      // resized output
    );

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, TYPE, QUALITY);
    });

    if (!blob) return null;

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return {
      base64,
      sizeKB: Math.round(blob.size / 1024),
      width: SIZE,
      height: SIZE,
    };
  }


  /* ------------ UPLOAD ------------ */
  async uploadImage(file,croppedAreaPixels) {
    const compressed = await this.imageCompresser(file,croppedAreaPixels);
    if (!compressed) return null;

    const { base64 } = compressed;

    const cred=await AuthManager.getAuthCred(
      this.organisationName,
      this.privateIP
    );
    console.log("here is your details",cred,Date.now());

    const imageId = this.generateImageId(cred.username);

    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}` +
      `/images/${cred.username}`;

    await axios.patch(
      url,
      {
        fields: {
          pic: { stringValue: base64 },
          imageId: { stringValue: imageId },
          updatedAt: { integerValue: Date.now().toString() },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${cred.idToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const cacheKey = `image_${imageId}`;
    await this.#setToCache(cacheKey, base64, 24 * 60 * 60 * 1000); // 24h TTL


    return imageId;
  }

  /* ------------ INDEXEDDB HELPERS ------------ */
  async #getDB() {
    if (this.db) return this.db;

    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ImageCacheDB", 1);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("images")) {
          db.createObjectStore("images", { keyPath: "key" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.db;
  }

  async #getFromCache(key) {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readonly");
      const store = tx.objectStore("images");
      const req = store.get(key);

      req.onsuccess = () => {
        const record = req.result;
        if (!record) return resolve(null);
        if (Date.now() > record.expiresAt) {
          this.#removeFromCache(key);
          return resolve(null);
        }
        resolve(record.data);
      };

      req.onerror = () => reject(req.error);
    });
  }

  async #setToCache(key, data, ttlMs = 24 * 60 * 60 * 1000) {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      store.put({ key, data, expiresAt: Date.now() + ttlMs });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async #removeFromCache(key) {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }


  /* ------------ FETCH (ANY USER) ------------ */
  async getImage(imageId) {
    if (!imageId) return;
    const { userId, version } = this.parseImageId(imageId);
    const cacheKey = `image_${imageId}`;

    // 1️⃣ Try IndexedDB cache
    const cached = await this.#getFromCache(cacheKey);
    if (cached) return cached;

    // 2️⃣ Fetch from Firestore
    const cred = await AuthManager.getAuthCred(this.organisationName, this.privateIP);
    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}/images/${userId}`;
    const res = await axios.get(url, { headers: { Authorization: `Bearer ${cred.idToken}` } });

    const pic = res.data?.fields?.pic?.stringValue || null;
    const remoteImageId = res.data?.fields?.imageId?.stringValue;

    if (!pic || !remoteImageId || remoteImageId.slice(-6) !== version) return null;

    // 3️⃣ Save to IndexedDB with 24h TTL
    await this.#setToCache(cacheKey, pic, 24 * 60 * 60 * 1000);

    return pic;
  }

}
