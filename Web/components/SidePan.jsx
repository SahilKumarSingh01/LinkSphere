"use client";

import { useEffect, useState } from "react";
import UserCard from "./UserCard";
import { usePresenceManager } from "@context/PresenceManager.jsx";
import { useImageManager } from "@context/ImageManager.jsx";

const ANIMATION_DURATION = 300;

function SidePan({ onClose }) {
  const { users } = usePresenceManager();
  const imageManager = useImageManager();

  const [visible, setVisible] = useState(false);
  const [imageMap, setImageMap] = useState(new Map());

  /* ---------- LOAD USER IMAGES (same pattern as UserPhotoGrid) ---------- */
  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      const map = new Map();

      for (const user of users) {
        const photoId = user.userInfo?.photo;
        if (!photoId) continue;

        const img = await imageManager.getImage(photoId);
        if (img) map.set(photoId, img);
      }

      if (!cancelled) setImageMap(map);
    };

    loadImages();
    return () => { cancelled = true; };
  }, [users, imageManager]);

  /* ---------- ENTER ANIMATION ---------- */
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const closeWithAnimation = () => {
    setVisible(false);
    setTimeout(onClose, ANIMATION_DURATION);
  };

  return (
    <>
      <div
        onClick={closeWithAnimation}
        className={
          visible
            ? "fixed inset-0 z-40 bg-black/40 opacity-100 transition-opacity duration-300"
            : "fixed inset-0 z-40 bg-black/40 opacity-0 transition-opacity duration-300"
        }
      />

      <aside
        className={
          visible
            ? "fixed top-2 bottom-1 right-1 z-50 w-96 bg-bg-secondary border border-border-color rounded-xl shadow-2xl translate-x-0 transition-transform duration-300 ease-out"
            : "fixed top-2 bottom-1 right-1 z-50 w-96 bg-bg-secondary border border-border-color rounded-xl shadow-2xl translate-x-full transition-transform duration-300 ease-out"
        }
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
          <h2 className="text-text-primary text-lg font-semibold">
            Online Users
          </h2>
          <button onClick={closeWithAnimation} className="text-text-primary text-xl">
            ✕
          </button>
        </div>

        <div className="flex flex-col p-3 overflow-y-auto h-[calc(100%-56px)] gap-1.5 items-center no-scrollbar">
          {users?.map((user) => (
            <UserCard
              key={user?.privateIP}
              name={user.userInfo?.name || "Anonymous"}
              imageLink={imageMap.get(user.userInfo?.photo)}
              lastSeen={user?.lastSeen}
            />
          ))}

          {!users?.length && (
            <span className="text-sm text-text-secondary text-center mt-4">
              No users online
            </span>
          )}
        </div>
      </aside>
    </>
  );
}

export default SidePan;
