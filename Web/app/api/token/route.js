import 'server-only'
import admin from "firebase-admin";
import { NextRequest } from 'next/server';
export const runtime = "nodejs";
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.NEXT_FIREBASE_ADMIN_TYPE,
      project_id: process.env.NEXT_FIREBASE_ADMIN_PROJECT_ID,
      private_key_id: process.env.NEXT_FIREBASE_ADMIN_PRIVATE_KEY_ID,
      private_key: process.env.NEXT_FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"), // important
      client_email: process.env.NEXT_FIREBASE_ADMIN_CLIENT_EMAIL,
      client_id: process.env.NEXT_FIREBASE_ADMIN_CLIENT_ID,
      auth_uri: process.env.NEXT_FIREBASE_ADMIN_AUTH_URI,
      token_uri: process.env.NEXT_FIREBASE_ADMIN_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.NEXT_FIREBASE_ADMIN_AUTH_PROVIDER_X509_CERT_URL,
      client_x509_cert_url: process.env.NEXT_FIREBASE_ADMIN_CLIENT_X509_CERT_URL,
      universe_domain: process.env.NEXT_FIREBASE_ADMIN_UNIVERSE_DOMAIN,
    }),
  });
}

export async function POST(req) {
  try {
     console.log("backend called");
    const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") ||"unknown";
    const body=await req.json();
    let {privateIP,organisationName}= body;
    
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
    
    // 1️⃣ Create custom token
    const customToken = await admin.auth().createCustomToken(uid);

    // 2️⃣ Create Firestore document immediately
    const userRef = admin.firestore().collection("organisation").doc(organisationName).collection("lastSeen").doc(uid);
    await userRef.set({
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }); // merge: true ensures we don't overwrite existing fields

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
