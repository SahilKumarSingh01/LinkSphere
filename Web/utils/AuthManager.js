import axios from "axios";

export class AuthManager {
  static #apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  static #storageKey = "cred";

  /* ---------------- PRIVATE STORAGE ---------------- */
  static #getCred() {
    const raw = localStorage.getItem(this.#storageKey);
    return raw ? JSON.parse(raw) : null;
  }

  static #setCred(cred) {
    localStorage.setItem(this.#storageKey, JSON.stringify(cred));
  }

  static #clearCred() {
    localStorage.removeItem(this.#storageKey);
  }

  /* ---------------- PRIVATE TOKEN FLOW ---------------- */
  static async #renewToken(organisationName, privateIP) {
    const resCustom = await axios.post("/api/token", {
      organisationName,
      privateIP,
    });

    const customToken = resCustom.data.token;
    const username = resCustom.data.userId;

    const resExchange = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${this.#apiKey}`,
      {
        token: customToken,
        returnSecureToken: true,
      }
    );

    const expiresInSec = Number(resExchange.data.expiresIn) || 3600;
    const expiresIn = Date.now() + expiresInSec * 1000 - 2 * 60 * 1000;
    console.log("renew token",resExchange);
    return {
      username,
      idToken: resExchange.data.idToken,
      refreshToken: resExchange.data.refreshToken,
      expiresIn,
    };
  }

  static async #refreshToken(refreshToken) {
    if (!refreshToken) return null;

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);

    const res = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${this.#apiKey}`,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const expiresInSec = Number(res.data.expires_in) || 3600;
    const expiresIn = Date.now() + expiresInSec * 1000 - 2 * 60 * 1000;
    return {
      idToken: res.data.id_token,
      refreshToken: res.data.refresh_token,
      expiresIn,
    };
  }

  /* ---------------- PUBLIC API ---------------- */
  static async getAuthCred(organisationName, privateIP) {
    if (!organisationName) throw new Error("organisationName is required");
    if (!privateIP) throw new Error("privateIP is required");

    let cred = this.#getCred();

    if (!cred?.idToken) {
      cred = await this.#renewToken(organisationName, privateIP);
      this.#setCred(cred);
      return cred;
    }

    if (Date.now() >= cred.expiresIn) {
      const refreshed = await this.#refreshToken(cred.refreshToken);
      console.log("refreshed",refreshed);
      if (refreshed) {
        cred = { ...cred, ...refreshed };
        this.#setCred(cred);
      }
    }

    return cred;
  }

  static logout() {
    this.#clearCred();
  }
}
