"use client";

import { useState } from "react";
import axios from "axios";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export default function Home() {
  const [customToken, setCustomToken] = useState(null);
  const [idToken, setIdToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [refreshUserId, setRefreshUserId] = useState(null);
  const [data, setData] = useState(null);

  // 1️⃣ Get custom token
  async function handleGetCustomToken() {
    try {
      const res = await axios.get("/api/token");
      setCustomToken(res.data.token);
    } catch (err) {
      console.error(err.response?.data || err);
    }
  }

  // 2️⃣ Exchange custom token → ID token
  async function handleExchangeToken() {
    try {
      const res = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
        {
          token: customToken,
          returnSecureToken: true,
        }
      );
      console.log(res);
      setIdToken(res.data.idToken);
      setRefreshToken(res.data.refreshToken);
    } catch (err) {
      console.error(err.response?.data || err);
    }
  }

  // 3️⃣ Update Firestore doc
  async function handleUpdateMyData() {
    if (!idToken) return;

    try {
      const res = await axios.patch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/some_collection/test-user-124?updateMask.fieldPaths=lastSeen`,
        {
          fields: {
            lastSeen: { timestampValue: new Date().toISOString() },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      setData(res.data);
      console.log("Last seen updated:", res.data);
    } catch (err) {
      console.error("Failed to update lastSeen:", err.response?.data || err);
    }
  }

  // 4️⃣ Fetch all users
  async function handleFetchAll() {
    if (!idToken) return;

    try {
      const res = await axios.get(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/some_collection`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      console.log(res.data);
      setData(res.data);
    } catch (err) {
      console.error(err.response?.data || err);
    }
  }

  // 5️⃣ Refresh ID token using refresh token
  async function handleRefreshIdToken() {
    if (!refreshToken) return;

    try {
      const params = new URLSearchParams();
      params.append("grant_type", "refresh_token");
      params.append("refresh_token", refreshToken);

      const res = await axios.post(
        `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,
        params,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      console.log("Refresh response:", res.data);
      setIdToken(res.data.id_token);        // update ID token
      setRefreshToken(res.data.refresh_token); // update refresh token if changed
      setRefreshUserId(res.data.user_id);   // store user ID
    } catch (err) {
      console.error("Failed to refresh ID token:", err.response?.data || err);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <button onClick={handleGetCustomToken}>1️⃣ Get Custom Token</button>
      <button onClick={handleExchangeToken} disabled={!customToken}>
        2️⃣ Exchange for ID Token
      </button>
      <button onClick={handleUpdateMyData} disabled={!idToken}>
        3️⃣ Update My Last Seen
      </button>
      <button onClick={handleFetchAll} disabled={!idToken}>
        4️⃣ Fetch All Users
      </button>
      <button onClick={handleRefreshIdToken} disabled={!refreshToken}>
        5️⃣ Refresh ID Token
      </button>

      <pre>Custom Token: {customToken}</pre>
      <pre>ID Token: {idToken}</pre>
      <pre>Refresh Token: {refreshToken}</pre>
      <pre>User ID from Refresh: {refreshUserId}</pre>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
