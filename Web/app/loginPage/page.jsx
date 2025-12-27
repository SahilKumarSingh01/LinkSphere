"use client";
import React from "react";
import RoomCard from "@components/RoomCard";
import SidePan from "@components/SidePan";
import { useState } from "react";
import { useRouter } from "next/navigation";


function LoginPage() {
  const orgs = ["mnnit-Allahabad", "nit-nagpur", "iit-delhi", "itt-BHU"];
  const router=useRouter();
  const [isSidePanOpen,setIsSidePanOpen]=useState(false)

  const groupList = [
    { name: "group1", image: "/image/boy.jpg", descripton: " Welcome,to group 1 " },
    { name: "group2", image: "/image/girl.jpg", descripton: " Welcome,to group 2 " },
    { name: "group3"  , descripton: " Welcome,to group 3 " },
    { name: "group4", image: "/image/boy.jpg", descripton: " Welcome,to group 4 " },
    { name: "group5", image: "/image/boy.jpg", descripton: " Welcome,to group 5 " },
    { name: "group6", image: "/image/girl.jpg", descripton: " Welcome,to group 6" },
  ];

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col">
      {/* ================= BACKGROUND GLOW ================= */}

      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-10%] top-[-10%] h-150 w-150 rounded-full bg-blue-600/20 blur-[160px]" />
        <div className="absolute right-[-10%] bottom-[-10%] h-150 w-150 rounded-full bg-indigo-600/10 blur-[180px]" />
      </div>
      <div className="h-2"></div>
       {/* ================= online user button ================= */}
        <section className="">
          
      {!isSidePanOpen && (
        <button
          onClick={() => setIsSidePanOpen(true)}
          className="
            flex items-center gap-2
            text-white font-medium
            hover:text-cyan-400
            transition-colors
          "
        >
          {/* Green dot */}
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"></span>
          </span>

          Online Users
        </button>
      )}

      <SidePan
        setIsSidePanOpen={setIsSidePanOpen}
        isSidePanOpen={isSidePanOpen}
      />
    </section>

      
      {/* ================= HERO SECTION (LEFT + RIGHT PANELS) ================= */}
      <section className="min-h-screen flex items-center">
        <div className="mx-auto w-full max-w-7xl px-16 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-12 lg:gap-12">
            
            {/* LEFT PANEL  */}
           
            <div className="flex flex-col items-center order-2 md:order-1">
              <div className="text-center space-y-10 mb-6">
                <h1 className="text-5xl font-bold tracking-tight text-white">
                  Get Started
                </h1>
               
                <p className="text-lg text-slate-400">
                  Create or join a secure chatspace
                </p>
              </div>
              <div className="h-3"></div>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <button className="group flex items-center gap-1 bg-blue-600 px-6 py-4 font-semibold rounded-lg shadow-lg hover:bg-blue-500 transition">
                  <span className="text-xl group-hover:rotate-90 transition">+</span>
                  Create New Group
                </button>

                <button 
                onClick={()=>router.push("/about")}
                className="border rounded-lg border-slate-700 bg-slate-900/70 px-8 py-4 text-slate-300 hover:bg-slate-800 transition">
                  About
                </button>
              </div>

              <div className="h-8" />

              <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900/40 p-8 backdrop-blur-xl">
               
                <label className="mb-3 block text-sm  text-slate-400">
                   Find your organization
                </label>

                <input
                  list="organizations"
                  placeholder="Search e.g. mnnit"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-4 text-white focus:ring-2 focus:ring-blue-500/40"
                />

                <datalist id="organizations">
                  {orgs.map((org) => (
                    <option key={org} value={org} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* RIGHT PANEL (UNCHANGED) */}
            <div className="flex flex-col items-center md:items-end text-center md:text-right space-y-8 order-1 md:order-2">
              <div className="relative group">
                <div className="absolute -inset-1 bg-linear-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition"></div>
                <img
                  src="/image/loginPage.png"
                  alt="LinkSphere Illustration"
                  className="relative w-[320px] lg:w-112.5 rounded-2xl shadow-2xl"
                />
              </div>

              <h2 className="text-5xl lg:text-6xl font-black bg-linear-to-b from-white to-slate-500 bg-clip-text text-transparent">
                LINKSPHERE
              </h2>
              <div className="flex flex-wrap justify-center md:justify-end gap-4 text-sm font-bold tracking-widest text-blue-400 uppercase"> 
                <span>No Middlemen</span> <span className="text-slate-700">•</span> 
                <span>No Data Access</span> <span className="text-slate-700">•</span>
                 <span>Full Privacy</span>
                  </div>
            </div>

          </div>
        </div>
      </section>

      {/* ================= ONLINE USERS (AFTER SCROLL) ================= */}
      <section className=" border-t border-slate-800">
  <div className="max-w-7xl mx-auto px-8 md:px-16 py-24">
    
    {/* Heading */}
    <div className="mb-16 text-center">
      <h3 className="text-3xl font-extrabold text-white">
        Online Group
      </h3>
      <p className="text-slate-400 mt-2">
        See which Group is  currently active
      </p>
    </div>
    <div className="h-4"></div>
    {/* GRID */}
    <div className="
      grid 
      grid-cols-1 
      sm:grid-cols-2 
      lg:grid-cols-3 
      gap-x-10
      gap-y-7
      place-items-center
    ">
      {groupList.map((group, index) => (
        <RoomCard
          key={index}
          imageLink={group.image}
          name={group.name}
          description={group.descripton}
        />
      ))}
    </div>

  </div>
</section>
    </main>
  );
}

export default LoginPage;
