"use client";

import { useEffect } from "react";
import { usePresenceManager } from "@context/PresenceManager.jsx";

export default function Home() {
  const presenceManager = usePresenceManager();

  useEffect(() => {
    if (!presenceManager) return;

    const initPresence = async () => {
      presenceManager.setOrganisation("my-organisation");

      await presenceManager.updateMyPresence({
        displayName: "hello how are you",
      });

      await presenceManager.fetchAllUsers();
    };

    initPresence();
  }, [presenceManager]);

  return <div>Home</div>;
}
