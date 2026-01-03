"use client";

const ImageCompresser = async (file) => {
  console.log("ImageCompresser called");

  const type = "image/jpeg"; 
  const quality = 0.5;

  const canvas = document.createElement("canvas");
  const imageBitmap = await createImageBitmap(file);

  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
 
  

  const ctx = canvas.getContext("2d");
  if(file.type=="image/png")
  {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(imageBitmap, 0, 0);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });

  if (!blob) {
    console.error("Blob is null");
    return null;
  }

  const compressedFile = new File([blob], file.name.replace(/\.png$/i, ".jpg"), { type });

  console.log(
    "Compressed file:",compressedFile
  );

  const base64String = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(compressedFile);
  });

  return base64String;
};

export default ImageCompresser;