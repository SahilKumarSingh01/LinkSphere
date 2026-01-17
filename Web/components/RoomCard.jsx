// components/RoomCard.jsx
import { FaPhone } from "react-icons/fa";
import { IoSettings } from "react-icons/io5";
import RoomUserCard from "./RoomUserCard";
const RoomCard = () => {


  const users=[
    {name:"user1",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/girl.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    {name:"user2",profilePic:"/image/boy.jpg"},
    // {name:"user2",profilePic:"/image/boy.jpg"},
    // {name:"user2",profilePic:"/image/boy.jpg"},
    // {name:"user2",profilePic:"/image/boy.jpg"},
    // {name:"user2",profilePic:"/image/boy.jpg"},
    // {name:"user2",profilePic:"/image/boy.jpg"},
    
   
   
  ]
  return (
    <div className="bg-bg-secondary  w-100 h-95  text-text-primary rounded-xl p-6 items-center shadow-lg flex flex-col   border border-border-color space-y-4 ">
      {/* Header */}
      
      <div className="w-full flex justify-between ">
        <h3 className="text-sm text-text-secondary font-bold pl-1">group Name2</h3>
        <div><IoSettings className="cursor-pointer text-react-icon"  size={20}/></div>
      </div>

      {/* Avatar user Profile*/}
      
     <div className="flex flex-wrap  flex-row justify-center gap-3">
        {users.map((user,idx) => (
          <RoomUserCard
            key={idx}
            name={user.name}
            profilePic={user.profilePic}
            userCount={Math.ceil(users.length / 3)}
          />
        ))}
      </div>


      {/* Join button */}
      <div className="mt-auto flex justify-end pb-2">
        <button className="mt-2 cursor-pointer bg-btn-primary hover:bg-btn-secondary-hover text-text-primary text-sm px-4 py-2 rounded flex items-center space-x-2 transition">
        <FaPhone className="cursor-pointer text-react-icon" size={16} />
        <span>Join and talk now!</span>
      </button>
      </div>
    </div>
  );
};

export default RoomCard;
