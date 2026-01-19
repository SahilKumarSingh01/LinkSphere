"use client";

import { FaPhone } from "react-icons/fa";
import { IoSettings } from "react-icons/io5";
import { useRouter } from "next/navigation";
import UserPhotoGrid from "./UserPhotoGrid"; // import your reusable component

const height = 38;
const width = 80;

const RoomCard = ({ roomId, users, title }) => {
  const router = useRouter();

  return (
    <div className="bg-bg-secondary text-text-primary rounded-xl p-6 shadow-lg flex flex-col space-y-4">
      
      {/* Header */}
      <div className="w-full flex justify-between">
        <h3 className="text-sm text-text-secondary font-bold pl-1">
          {title}
        </h3>
        <IoSettings className="cursor-pointer text-text-secondary" size={20} />
      </div>

      {/* Users */}
      <UserPhotoGrid users={users} height={height} width={width} />

      {/* Join */}
      <div className="mt-auto flex justify-center pb-2">
        <button
          className="mt-2 bg-bg-tertiary hover:bg-btn-secondary-hover text-text-primary text-sm px-4 py-2 rounded flex items-center space-x-2 transition"
          onClick={() => router.push(`/room/${roomId}`)}
        >
          <FaPhone className="text-green-600" size={16} />
          <span>Join and talk now!</span>
        </button>
      </div>
    </div>
  );
};

export default RoomCard;
