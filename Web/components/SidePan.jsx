"use client"
import React from 'react'
import UserCard from './UserCard';
const onlineUserList = [
    { name: "user1", image: "/image/boy.jpg", descripton: "hello, this is user1 " },
    { name: "user2", image: "/image/girl.jpg", descripton: "hello, this is user2 " },
    { name: "user3" , descripton: "hello, this is user3 " },
    { name: "user4", image: "/image/boy.jpg", descripton: "hello, this is user4 " },
    { name: "user5", image: "/image/boy.jpg", descripton: "hello, this is user5 " },
    { name: "user6", image: "/image/girl.jpg", descripton: "hello, this is user6" },
    { name: "user7", image: "/image/girl.jpg", descripton: "hello, this is user7" },
    { name: "user8",  descripton: "hello, this is user8" },
    
  ];

function SidePan({setIsSidePanOpen, isSidePanOpen}) {
  return (
    <>
     <div
        onClick={() => setIsSidePanOpen(false)}
        className={`
          fixed top-16 inset-x-0 bottom-0 bg-black/40 z-40
          transition-opacity duration-300
          ${isSidePanOpen ? "opacity-100" : "opacity-0 pointer-events-none"}
        `}
      />

        <aside
   className={`
    fixed top-16 left-0 z-50
    w-96 h-[calc(100vh-4rem)]
    bg-[#1e1b2e]
    shadow-2xl
    transform transition-transform duration-300
    ${isSidePanOpen ? "translate-x-0" : "-translate-x-full"}
  `}
    >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-white text-lg font-semibold">
            Online Users
          </h2>
          <button
            onClick={() => setIsSidePanOpen(false)}
            className="text-white text-xl"
          >
            ✕
          </button>
        </div>
        <div className='h-2'></div>

        {/* Content */}
        <div className=" flex flex-col p-4 overflow-y-auto h-[calc(100%-56px)] gap-1.5 items-center ">
          {onlineUserList.map((user,index)=>(<UserCard key={index} imageLink={user.image} name={user.name} description={user.descripton}/>))}
        </div>
        
    </aside>
   
    </>
  )
}

export default SidePan
