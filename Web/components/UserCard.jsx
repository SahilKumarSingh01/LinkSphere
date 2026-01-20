"use client";
import React from "react";

const UserCard = ({ imageLink, name, lastSeen }) => {
  const initial = name?.charAt(0)?.toUpperCase() || "?";

  const getLastSeenText = () => {
    if (!lastSeen) return "";

    const diffMs = Date.now() - lastSeen;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return "Online";

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Last seen ${diffMin}m ago`;

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `Last seen ${diffHr}h ago`;

    const diffDay = Math.floor(diffHr / 24);
    return `Last seen ${diffDay}d ago`;
  };

  return (
    <div className="bg-bg-tertiary text-text-secondary rounded-xl shadow-2xl px-2 py-2 w-[93%] max-w-md flex items-center space-x-4">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-full overflow-hidden shadow-btn-primary shadow-sm flex items-center justify-center">
        {imageLink ? (
          <img src={imageLink} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-btn-primary to-btn-primary-active flex items-center justify-center text-text-primary font-bold text-lg">
            {initial}
          </div>
        )}
      </div>

      {/* Name + Last Seen */}
      <div className="flex flex-col">
        <h2 className="text-lg font-bold tracking-tight">{name}</h2>
        <span
          className={`text-xs ${
            getLastSeenText() === "Online"
              ? "text-green-500"
              : "text-text-tertiary"
          }`}
        >
          {getLastSeenText()}
        </span>
      </div>
    </div>
  );
};

export default UserCard;
