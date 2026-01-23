"use client";
import { useEffect, useState } from "react";
import { PiMicrophoneBold } from "react-icons/pi";
import { BiMicrophoneOff } from "react-icons/bi";
import { IoCallSharp } from "react-icons/io5";
import { BsFillPersonLinesFill } from "react-icons/bs";
import { useSearchParams } from "next/navigation";

import UserPhotoGrid from "@components/UserPhotoGrid";
import SidePan from "@components/SidePan.jsx";

import { useParams, useRouter } from "next/navigation";
import { usePresenceManager } from "@context/PresenceManager.jsx";
import { useMessageHandler } from "@context/MessageHandler.jsx";
import { Room as RoomCore } from "@utils/Room.js";
import { Mutex } from "@utils/Mutex";

const height = 30;
const width = 200;
const lck=new Mutex();

export default function Room() {
  const [isMicroPhoneMuted, setIsMicroPhoneMuted] = useState(false);
  const [users, setUsers] = useState([]);
  const [showSidePan, setShowSidePan] = useState(false);
  const [roomInstance, setRoomInstance] = useState(null);

  const { presenceManager, users: allUsers } = usePresenceManager();
  const messageHandler = useMessageHandler();
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const roomTitle =searchParams.get("title")||"Untitled Room";

  /* ---------- CREATE & DESTROY ROOM INSTANCE ---------- */
  useEffect(() => {
    if(roomInstance)
      return  () => { //don't change this order otherwise its being called multiple times
        roomInstance.stop();
      }
      setRoomInstance(new RoomCore());
  }, [roomInstance]);

  /* ---------- INIT ROOM ---------- */
  useEffect(() => {
    if (!presenceManager || !messageHandler || !roomInstance) return;
    const p=lck.lock();
    (async () => {
      try {
        await p;
        await presenceManager.activate();
        presenceManager?.updateMyPresence({ roomId: id, roomTitle: roomTitle });
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const user = presenceManager.getMyPresence();
        roomInstance.init(
          messageHandler,
          stream,
          id,
          user.userInfo?.name,
          user.userInfo?.photo
          
        );
      } catch (e) {
        console.log(e);
      }
      finally{
          lck.unlock();
      }
    })();
    return async ()=>{
      await lck.lock();
      presenceManager.updateMyPresence({ roomId: "", roomTitle: "" });
      lck.unlock();
    }
  }, [presenceManager, messageHandler, roomInstance, id]);

  /* ---------- USERS IN ROOM ---------- */
  useEffect(() => {
    const filteredUsers =
      allUsers?.filter(u => u.userInfo?.roomId === id) || [];

    setUsers(filteredUsers);
    // console.log("filter users",filteredUsers);

    filteredUsers.forEach(user => {
      roomInstance?.addClient({
        ip: user?.privateIP,
        port: user?.tcpPort,
        name: user.userInfo?.name,
        photo: user.userInfo?.photo,
      });
    });
  }, [allUsers, id, roomInstance]);

  /* ---------- DEVICE CHANGE ---------- */
  useEffect(() => {
    const handleDeviceChange = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        roomInstance?.refreshAudio(stream);
      } catch (e) {
        console.error(e);
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [roomInstance]);

  /* ---------- CONTROLS ---------- */
  const onMuteStateChange = () => {
    const isMuted = !isMicroPhoneMuted;
    setIsMicroPhoneMuted(isMuted);
    isMuted ? roomInstance?.mute() : roomInstance?.unmute();
  };

  const onHangUp = () => {
    router.push("/rooms");
  };

  return (
    <div className="flex-1 w-full bg-bg-primary flex flex-col overflow-hidden scale-in">

      {/* Top Control Bar */}
      <div className="flex justify-center mt-4">
        <div className="bg-bg-secondary rounded-xl flex gap-3 px-4 py-2 shadow-lg">
          <button className="relative group " onClick={onMuteStateChange}>
            {isMicroPhoneMuted ? (
              <BiMicrophoneOff size={26} className="text-text-secondary" />
            ) : (
              <PiMicrophoneBold size={26} className="text-text-secondary"/>
            )}
          </button>

          <button onClick={onHangUp}>
            <IoCallSharp color="red" size={26} />
          </button>
        </div>
      </div>

      <h2 className="text-text-primary text-2xl font-bold m-4">{roomTitle}</h2>

      {/* Main Area */}
      <div className="flex-1 flex items-end justify-center pb-14">
        <UserPhotoGrid users={users} height={height} width={width} />
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
    </div>
  );
}
