"use client";

import { useEffect, useState } from "react";
import { useImageManager } from "@context/ImageManager.jsx";
import RoomUserCard from "@components/RoomUserCard.jsx";
import { PeerStatus } from "@utils/Room";
const UserPhotoGrid = ({ users, height = 38, width = 80 }) => {
  const imageManager = useImageManager();
  const [imageMap, setImageMap] = useState(new Map());

  /* ---------- async image loader ---------- */
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

  /* ---------- size calculator ---------- */
  const sizeCache = new Map();
  function calcSize(t) {
    if (sizeCache.has(t)) return sizeCache.get(t);

    let low = 0;
    let high = Math.min(height, width);
    let ans = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (mid === 0) { low = 1; continue; }

      const fit = Math.floor(width / mid) * Math.floor(height / mid);
      if (fit >= t) { ans = mid; low = mid + 1; }
      else { high = mid - 1; }
    }

    sizeCache.set(t, ans);
    return ans;
  }

  const size = calcSize(users.length);

  return (
    <div
      className="flex flex-wrap justify-center items-center"
      style={{
        width: `calc(var(--spacing) * ${width + 1})`,
        height: `calc(var(--spacing) * ${height + 1})`,
      }}
    >
      {users.map((user, idx) => (
        <RoomUserCard
          key={idx}
          name={user.userInfo?.name}
          profilePic={imageMap.get(user.userInfo?.photo)}
          size={size}
          status={user.userInfo.status||PeerStatus.CONNECTED}
        />
      ))}
    </div>
  );
};

export default UserPhotoGrid;
