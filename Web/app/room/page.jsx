"use client";
import { useState } from "react";
import { PiMicrophoneBold} from "react-icons/pi";
import { BiMicrophoneOff } from "react-icons/bi";
import { IoCallSharp } from "react-icons/io5";

import RoomUserCard from "@components/RoomUserCard";
import { useSidePan } from '@context/SidePanContext';
import { BsFillPersonLinesFill } from "react-icons/bs";
import SidePan from '@components/SidePan.jsx';


export default function Home() {
  const users=[{name:"user1",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user3",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user3",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user3",profilePic:"/image/boy.jpg"},
    {name:"user4",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
  ]

  const [isMircoPhoneMuted,setIsMicroPhoneMuted]=useState(false);
  const {isSidePanOpen,setIsSidePanOpen}=useSidePan();
  return <>
    <div className="h-screen w-full bg-bg-primary flex flex-col overflow-hidden">

      {/* Top Control Bar */}
      <div className="flex justify-center mt-4">
        <div className="bg-bg-secondary backdrop-blur-lg rounded-xl flex gap-3 px-4 py-2 shadow-lg">
          <button 
          className="relative group"
          onClick={()=>(setIsMicroPhoneMuted(!isMircoPhoneMuted))}
          >{isMircoPhoneMuted?<BiMicrophoneOff className="cursor-pointer text-react-icon"  size={26} />:<PiMicrophoneBold className="cursor-pointer text-react-icon"  size={26} />}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 
                          whitespace-nowrap rounded-md bg-bg-tertiary px-3 py-1.5
                          text-sm text-white opacity-0 shadow-lg
                          transition-all duration-200
                          group-hover:opacity-100 group-hover:translate-y-1">
            {isMircoPhoneMuted?"Unmute":"Mute"}
          </div>
          </button>
          <button className="relative group">
          <IoCallSharp className="cursor-pointer" color="red" size={26} />

          <div className="absolute top-12 left-1/2 -translate-x-1/2 
                          whitespace-nowrap rounded-md bg-bg-tertiary px-3 py-1.5
                          text-sm text-white opacity-0 shadow-lg
                          transition-all duration-200
                          group-hover:opacity-100 group-hover:translate-y-1">
            Hang up this call
          </div>
        </button>
        </div>
      </div>



      {/* Main Area */}
      <div className="flex-1 flex items-end justify-center pb-14">
      <div className="flex flex-wrap gap-4 bg-bg-primary px-6 py-3 rounded-2xl max-w-5xl justify-center">
        {users.map((user,i) => (
          <RoomUserCard
            key={i} // later change it some unique id
            name={user.name}
            profilePic={user.profilePic}
            userCount={Math.ceil((users.length)/3)}
          />
        ))}
      </div>
    </div>

      <div 
        className='fixed z-50'>
          <SidePan/>
        </div>
        {!isSidePanOpen?
        <div className="group fixed bottom-10 right-1 lg:right-5 mr-1 z-50">
        <BsFillPersonLinesFill 
          className="cursor-pointer text-react-icon"
          size={40}
          onClick={()=>setIsSidePanOpen(true)}
        />

          <div className="
          absolute z-10 right-full mr-2 top-1/2 -translate-y-1/2
          whitespace-nowrap rounded-md bg-bg-tertiary px-3 py-1.5
          text-text-primary shadow-lg
          opacity-0
          cursor-pointer
          pointer-events-none
          transition-all duration-150 delay-200
          group-hover:opacity-100 
          group-hover:pointer-events-auto
        ">
          Online User
        </div>


      </div>:null};






    </div>
  </>
}

