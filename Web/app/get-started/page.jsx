"use client";

import { useState ,useEffect,useRef} from "react";
import { useRouter } from "next/navigation";
import { useMessageHandler } from "@context/MessageHandler.jsx";
import { usePresenceManager } from "@context/PresenceManager";
import { ImageManager } from "@utils/ImageManager";
import ImageCropper from "@components/ImageCropper";
const MAX_LEN = 20;

export default function GetStartedPage() {
        // orgList in state (replace later with fetched data)
  const [orgList, setOrgList] = useState(["mnnit","testing",]);
  const [userName, setUserName] = useState("Anonymous");
  const [editingName, setEditingName] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);

  const [organisation, setOrganisation] = useState(orgList[0]);
  const [editingOrg, setEditingOrg] = useState(false);
  const [photo, setPhoto] = useState(""); // empty → fallback avatar
  const [imageSrc,setImageSrc]=useState("");
  const managerRef=useRef(new ImageManager());
  const router = useRouter();
  const messageHandler=useMessageHandler();
  const {presenceManager}=usePresenceManager();
  
  useEffect(()=>{
    if(messageHandler&&presenceManager){
      (async()=>{
        managerRef.current.setPrivateIP(messageHandler.getDefaultIP());
        const data=await presenceManager.getMyPresence();
        setPhoto(data.userInfo?.photo||photo);
        setUserName(data.userInfo?.name||userName);
        setOrganisation(data.userInfo?.organisation||organisation);
        managerRef.current.setOrganisation(data.userInfo?.organisation||organisation);
        presenceManager.setOrganisation(data.userInfo?.organisation||organisation);
      }
      )()
    }
  },[messageHandler,presenceManager])
  useEffect(()=>{
    const fetchPhoto=async ()=>{
      if(photo){
        setImageSrc(await managerRef.current.getImage(photo));
      }
    }
    fetchPhoto();
  },[photo])

  const handleImageUpload=async ( file,croppedAreaPixels)=>{
    if(managerRef.current){
      // console.log(file,croppedAreaPixels);
      const photo=await managerRef.current.uploadImage(file,croppedAreaPixels);
      presenceManager.updateMyPresence({photo});
      setPhoto(photo);
      setEditingPhoto(false);
      // console.log("here is your photo",photo);
    }
  }
  const handleRemovePhoto = async () => {
    setPhoto(null);
    setImageSrc("");
    await presenceManager.updateMyPresence({ photo: null });
  };

  
  const handleHopIn=async ()=>{
    router.push("/rooms");
    await presenceManager.updateMyPresence({name:userName,photo});
    // await presenceManager.activate();
  } 

  return (
    <main className="flex-1 bg-bg-primary text-text-primary px-6 py-10 flex flex-col items-center justify-center">
      {editingPhoto&&<ImageCropper onCancel={()=>{setEditingPhoto(false)}} onUpload={handleImageUpload}/>}
      <div className="w-full max-w-md scale-in">
        <h1 className="text-4xl font-bold mb-4 text-center">Get Started</h1>
        <p className="text-text-tertiary mb-10 text-center">
          Set up your profile to start using LinkSphere. Edit your details below.
        </p>

        {/* Profile Card */}
        <div className="bg-bg-secondary rounded-2xl p-8 shadow-lg flex flex-col items-center gap-4">
          {/* Avatar */}
          <div className="relative">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt="Profile photo"
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-btn-primary to-btn-primary-active flex items-center justify-center text-text-primary font-bold text-3xl">
              {userName.charAt(0)}
            </div>
            )}
            <div className="absolute bottom-0 right-0 flex justify-end gap-4">
              {photo && (
                <button
                  onClick={handleRemovePhoto}
                  className="bg-bg-primary text-red-400 px-1 py-1 rounded-full text-xs hover:bg-bg-tertiary transition"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setEditingPhoto(true)}
                className="bg-bg-primary text-text-secondary px-1 py-1 rounded-full text-xs hover:bg-bg-tertiary transition"
              >
                Edit
              </button>
            </div>

          </div>

          {/* Name */}
          <div className="w-full flex flex-col items-center">
            <p className="text-sm text-text-secondary mb-1">Name</p>
            {editingName ? (
              <div className="flex justify-center items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <input
                    type="text"
                    value={userName}
                    maxLength={MAX_LEN}
                    onChange={(e) => setUserName(e.target.value)}
                    className="px-3 py-3 rounded-lg border border-gray-300 outline-none text-text-primary bg-bg-primary"
                  />

                  {!userName.length ||userName.length === MAX_LEN? (
                    <span className="absolute text-xs text-red-500">
                      {userName.length?"Maximum length reached":"Username is required"}
                    </span>
                  ):(
                  <span className="absolute text-xs text-gray-500">
                    {userName.length}/{MAX_LEN}
                  </span>
                  )}
                </div>

                <button
                  onClick={() =>
                    setUserName((curName) => {
                      if(!curName.length)return "";
                      presenceManager.updateMyPresence({name:curName});
                      setEditingName(false);
                      return curName; // keep state unchanged
                    })
                  }
                  className="px-3 py-2 bg-btn-primary text-white rounded-lg hover:bg-btn-primary-hover transition"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex justify-center items-center gap-2">
                <p className="text-xl font-semibold">{userName}</p>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-xs text-text-secondary hover:text-text-primary transition"
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Organisation */}
          <div className="w-full flex flex-col items-center">
            <p className="text-sm text-text-secondary mb-1">Organisation</p>
            {editingOrg ? (
              <div className="flex justify-center items-center gap-2">
                <select
                  value={organisation}
                  onChange={(e) => setOrganisation(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-bg-primary outline-none text-text-primary"
                >
                  {orgList.map((org, idx) => (
                    <option key={idx} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
                <button
                onClick={() =>
                    setOrganisation((organisation) => {
                      managerRef.current.setOrganisation(organisation);
                      presenceManager.setOrganisation(organisation);  
                      presenceManager.updateMyPresence({organisation});                    
                      setEditingOrg(false);
                      return organisation; // keep state unchanged
                    })}
                    className="px-3 py-2 bg-btn-primary text-white rounded-lg hover:bg-btn-primary-hover transition"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex justify-center items-center gap-2">
                <p className="text-xl font-semibold">{organisation}</p>
                <button
                  onClick={() => setEditingOrg(true)}
                  className="text-xs text-text-secondary hover:text-text-primary transition"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hop In Button */}
        <div className="mt-8 flex justify-center w-full">
          <button
            onClick={handleHopIn}
            className="px-8 py-3 bg-btn-primary text-white rounded-lg font-semibold hover:bg-btn-primary-hover transition"
          >
            Hop In
          </button>
        </div>
      </div>
    </main>
  );
}
