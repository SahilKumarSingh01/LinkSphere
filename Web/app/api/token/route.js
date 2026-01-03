import 'server-only'
import admin from "firebase-admin";
import { NextRequest } from 'next/server';
import { db } from '../../../lib/firebase.js';
import { exportTraceState } from 'next/dist/trace/trace.js';
import imageUploaderHandler from '@utils/imageUploaderHandler.js';
import imageDeleteHandler from '@utils/imageDeleteHandler.js';
export const runtime = "nodejs";
// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert({
//       type: process.env.NEXT_FIREBASE_ADMIN_TYPE,
//       project_id: process.env.NEXT_FIREBASE_ADMIN_PROJECT_ID,
//       private_key_id: process.env.NEXT_FIREBASE_ADMIN_PRIVATE_KEY_ID,
//       private_key: process.env.NEXT_FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"), // important
//       client_email: process.env.NEXT_FIREBASE_ADMIN_CLIENT_EMAIL,
//       client_id: process.env.NEXT_FIREBASE_ADMIN_CLIENT_ID,
//       auth_uri: process.env.NEXT_FIREBASE_ADMIN_AUTH_URI,
//       token_uri: process.env.NEXT_FIREBASE_ADMIN_TOKEN_URI,
//       auth_provider_x509_cert_url: process.env.NEXT_FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL,
//       client_x509_cert_url: process.env.NEXT_FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
//       universe_domain: process.env.NEXT_FIREBASE_ADMIN_UNIVERSE_DOMAIN,
//     }),
//   });
// }

export async function POST(req) {
  try {
    //  console.log("backend called",req);
    const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") ||"unknown";
    const body=await req.json();
    let {privateIP,organisationName,userInfo}= body;
    
    if(!privateIP || !organisationName)
    {
       return new Response(
         "PrivateIP And organisationName Needed",
         {
          status:400,
          headers:{"Content-Type":"application/json"}
         }
       );
    }
    organisationName=organisationName.toLowerCase();
    
    //console.log("ip:",ip," privateIP:",privateIP," organisationName:",organisationName);
    const uid = privateIP+":"+ip;
    // console.log(ip,privateIp);
    // 1️⃣ Create custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // 2️⃣ Create Firestore document immediately
    const userRef = db.collection("organisation").doc(organisationName).collection("lastSeen").doc(uid);
    await userRef.set(userInfo, { merge: true }); // merge: true ensures we don't overwrite existing fields

    return new Response(
      JSON.stringify({ 
        token: customToken,
        userId:uid
       }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.log(err);
    return new Response(
      JSON.stringify({ error: "Failed to create custom token or user doc" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function PATCH(req) {
  try {
    const formData = await req.formData();
    const base64String=formData.get("base64String");
    //console.log("base64String:",base64String);
    const res=await imageUploaderHandler(base64String);

    //console.log("res:",res);


    return Response.json(
      { message: "Successfully uploaded pic" },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    
   
    const res=await imageDeleteHandler();

    return Response.json(
      { message: "Successfully deleted pic" },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
