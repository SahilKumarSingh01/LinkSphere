'use client';

import { useState, useEffect } from "react";
import RoomCard from '@components/RoomCard';
import { BsFillPersonLinesFill } from "react-icons/bs";
import { FaPlus, FaTimes, FaCheck } from "react-icons/fa";
import SidePan from '@components/SidePan.jsx';
import { useRouter } from "next/navigation";
import { useMessageHandler } from "@context/MessageHandler.jsx";
import { usePresenceManager } from "@context/PresenceManager.jsx";

const MAX_LEN = 20;

export default function Page() {
  const [showSidePan, setShowSidePan] = useState(false);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const router = useRouter();
  const messageHandler = useMessageHandler();
  const { presenceManager, users } = usePresenceManager();

  const [roomUsersMap, setRoomUsersMap] = useState(new Map());
  const [roomTitleMap, setRoomTitleMap] = useState(new Map());

  /* ---------------- GROUP USERS BY ROOM ---------------- */
  useEffect(() => {
    if (!users || !users.length) {
      setRoomUsersMap(new Map());
      setRoomTitleMap(new Map());
      return;
    }

    const usersMap = new Map();
    const titlesMap = new Map();

    for (const user of users) {
      const roomId = user.userInfo?.roomId;
      if (!roomId) continue;

      const roomTitle = user.userInfo?.roomTitle || "Untitled Room";

      if (!usersMap.has(roomId)) {
        usersMap.set(roomId, []);
        titlesMap.set(roomId, roomTitle);
      }

      usersMap.get(roomId).push(user);
    }

    setRoomUsersMap(usersMap);
    setRoomTitleMap(titlesMap);
  }, [users]);

  useEffect(() => {
    const init=async()=>{
      await presenceManager?.updateMyPresence({ roomId:"", roomTitle:"" });
      await presenceManager?.activate();
    }
    init();
    
  }, [presenceManager]);

  /* ---------------- CREATE ROOM ---------------- */
  const handleRoomCreate = (roomTitle) => {
    const ts = Date.now().toString().slice(-6);
    const roomId = `${messageHandler.getDefaultIP()}_${ts}`;
    presenceManager.updateMyPresence({ roomId, roomTitle });
    router.push(`/room/${roomId}`);
  };

  return (
    <div className="flex-1 bg-bg-primary scale-in">
      <div className="p-4">
        <h2 className="text-text-primary text-2xl font-extrabold text-center">
          See which Group is currently active
        </h2>
      </div>

      {/* Rooms */}
      <div className="flex flex-wrap gap-10 flex-row pt-10 px-15 lg:px-30 pb-5 scale-in">
        {[...roomUsersMap].map(([roomId, usersInRoom]) => (
          <RoomCard
            key={roomId}
            roomId={roomId}
            title={roomTitleMap.get(roomId)}
            users={usersInRoom}
          />
        ))}
      </div>

      {/* Side Panel */}
      {showSidePan && <SidePan onClose={() => setShowSidePan(false)} />}

      {!showSidePan && (
        <div className="group fixed top-10 right-1 lg:right-5 mr-1 z-50">
          <BsFillPersonLinesFill
            className="cursor-pointer text-text-secondary"
            size={40}
            onClick={() => setShowSidePan(true)}
          />
          <div className="absolute z-10 right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-bg-tertiary px-3 py-1.5 text-text-primary shadow-lg opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-500 group-hover:pointer-events-auto">
            Online Users
          </div>
        </div>
      )}

      {/* Create Room Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-15 bg-bg-tertiary hover:bg-btn-secondary-hover text-text-primary p-4 rounded-full shadow-lg transition"
      >
        <FaPlus size={20} />
      </button>

      {/* Create Room Modal */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-bg-secondary rounded-xl p-6 w-80 space-y-4 shadow-xl">
            <h3 className="text-text-primary font-bold text-center">
              Create Room
            </h3>

            <div className="relative flex flex-col items-center gap-1">
              <input
                type="text"
                placeholder="Room title"
                value={title}
                maxLength={MAX_LEN}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-3 rounded bg-bg-tertiary text-text-primary outline-none"
              />

              {!title.length || title.length === MAX_LEN ? (
                <span className="absolute -bottom-5 text-xs text-red-500">
                  {title.length ? "Maximum length reached" : "Title is required"}
                </span>
              ) : (
                <span className="absolute -bottom-5 text-xs text-gray-500">
                  {title.length}/{MAX_LEN}
                </span>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => {
                  setOpen(false);
                  setTitle("");
                }}
                className="flex items-center gap-2 px-3 py-1 rounded bg-gray-600 text-white text-sm"
              >
                <FaTimes />
                Cancel
              </button>

              <button
                onClick={() => {
                  if (!title.trim()) return;
                  handleRoomCreate(title);
                  setOpen(false);
                  setTitle("");
                }}
                className="flex items-center gap-2 px-3 py-1 rounded bg-green-600 text-white text-sm"
              >
                <FaCheck />
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
