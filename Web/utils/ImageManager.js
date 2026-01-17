"use client";

import axios from "axios";

export class ImageManager {
  constructor() {
    /* ------------ CONFIG ------------ */
    this.projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    this.apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    /* ------------ STATE ------------ */
    this.organisationName = null;
    this.privateIP = null;
  }

  /* ------------ SETTERS ------------ */
  setOrganisation(name) {
    this.organisationName = name;
  }

  setPrivateIP(ip) {
    this.privateIP = ip;
  }

  /* ------------ AUTH ------------ */
  async renewToken() {
    if (!this.organisationName) throw new Error("organisationName not set");
    if (!this.privateIP) throw new Error("privateIP not set");

    const resCustom = await axios.post("/api/token", {
      organisationName: this.organisationName,
      privateIP: this.privateIP
    });

    const customToken = resCustom.data.token;
    const userId = resCustom.data.userId;

    const resExchange = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.apiKey}`,
      {
        token: customToken,
        returnSecureToken: true,
      }
    );

    const expiresInSec = Number(resExchange.data.expiresIn) || 3600;
    const expiresIn = Date.now() + expiresInSec * 1000 - 2 * 60 * 1000;

    return {
      username: userId,
      idToken: resExchange.data.idToken,
      refreshToken: resExchange.data.refreshToken,
      expiresIn,
    };
  }

  async refreshToken() {
    const stored = localStorage.getItem("imageCred");
    const data = stored ? JSON.parse(stored) : null;
    if (!data?.refreshToken) return null;

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", data.refreshToken);

    const res = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${this.apiKey}`,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const expiresInSec = Number(res.data.expiresIn) || 3600;
    const expiresIn = Date.now() + expiresInSec * 1000 - 2 * 60 * 1000;

    return {
      idToken: res.data.idToken,
      refreshToken: res.data.refreshToken,
      expiresIn,
    };
  }

  async ensureAuth() {
    let stored = localStorage.getItem("imageCred");
    let cred = stored ? JSON.parse(stored) : null;

    if (!cred?.idToken) {
      cred = await this.renewToken();
      localStorage.setItem("imageCred", JSON.stringify(cred));
      return cred;
    }

    if (Date.now() >= cred.expiresIn) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        cred = { ...cred, ...refreshed };
        localStorage.setItem("imageCred", JSON.stringify(cred));
      }
    }

    return cred;
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

    const cred = await this.ensureAuth();
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

    return imageId;
  }

  /* ------------ FETCH (ANY USER) ------------ */
  async getImage(imageId) {
    if(!imageId)
        return;
    console.log(imageId);
    const { userId, version } = this.parseImageId(imageId);
    const cacheKey = `image_${imageId}`;

    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() < parsed.expiresAt) {
        return parsed.pic;
      }
    }

    const cred = await this.ensureAuth();

    const url =
      `https://firestore.googleapis.com/v1/projects/${this.projectId}` +
      `/databases/(default)/documents/organisation/${this.organisationName}` +
      `/images/${userId}`;

    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${cred.idToken}` },
    });

    const pic = res.data?.fields?.pic?.stringValue || null;
    const remoteImageId = res.data?.fields?.imageId?.stringValue;

    if (!pic || !remoteImageId || remoteImageId.slice(-6) !== version) {
      return null;
    }

    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        pic,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      })
    );

    return pic;
  }
}
