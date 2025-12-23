"use client";

import { useState } from "react";
import axios from "axios";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

export default function Home() {
  const [data, setData] = useState(null);
  const [organisationName, setOrganisationName] = useState("mnnit");

  // ---------------- Fetch all users ----------------
  async function fetchAllUsers(orgName = organisationName) {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;

    try {
      const res = await axios.get(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/organisation/${orgName}/lastSeen`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setData(res.data);
      console.log("Fetched all users:", res.data);
    } catch (err) {
      console.error("Failed to fetch users:", err.response?.data || err);
    }
  }

  // ---------------- Update my IP / lastSeen ----------------
  async function updateMyIP(localIP, orgName = organisationName) {
    if (!localIP || !orgName) return;

    let storedIP = localStorage.getItem("localIP");
    let accessToken = localStorage.getItem("accessToken");
    let refreshToken = localStorage.getItem("refreshToken");
    let userId = localStorage.getItem("userId");

    try {
      // Step 1: Get custom token if IP changed or no access token
      if (storedIP !== localIP || !accessToken) {
        const resToken = await axios.post("/api/token", {
          organisationName: orgName,
          privateIP: localIP,
        });

        const customToken = resToken.data.token;
        userId = resToken.data.userId;

        const resExchange = await axios.post(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
          { token: customToken, returnSecureToken: true }
        );

        accessToken = resExchange.data.idToken;
        refreshToken = resExchange.data.refreshToken;

        localStorage.setItem("localIP", localIP);
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        localStorage.setItem("userId", userId);
      }

      // Step 2: Try updating lastSeen
      try {
        const resUpdate = await axios.patch(
          `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/organisation/${orgName}/lastSeen/${userId}?updateMask.fieldPaths=lastSeen`,
          { fields: { lastSeen: { timestampValue: new Date().toISOString() } } },
          { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
        );

        console.log("Updated my lastSeen:", resUpdate.data);
        setData(resUpdate.data);
        return resUpdate.data;
      } catch (err) {
        // Step 3: Handle token expired
        if (err.response?.status === 401 && refreshToken) {
          console.log("Access token expired, refreshing...");
          const params = new URLSearchParams();
          params.append("grant_type", "refresh_token");
          params.append("refresh_token", refreshToken);

          const resRefresh = await axios.post(
            `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`,
            params,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          );

          accessToken = resRefresh.data.id_token;
          refreshToken = resRefresh.data.refresh_token;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", refreshToken);

          // Retry lastSeen update
          const retry = await axios.patch(
            `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/organisation/${orgName}/lastSeen/${userId}?updateMask.fieldPaths=lastSeen`,
            { fields: { lastSeen: { timestampValue: new Date().toISOString() } } },
            { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
          );

          console.log("Updated after token refresh:", retry.data);
          setData(retry.data);
          return retry.data;
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error("Failed to update my IP / lastSeen:", err.response?.data || err);
      return null;
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => fetchAllUsers()}>Fetch All Users</button>
      <button
        onClick={() => {
          const localIP = prompt("Enter your IP:");
          if (localIP) updateMyIP(localIP);
        }}
      >
        Update My IP / Last Seen
      </button>

      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
