const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const imageExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".heic",
  ".avif"
];


async function optimizeImg(img, picType) {
    try {
        const ext = path.extname(img);
        console.log(ext)
        const isImgFormat = imageExtensions.includes(ext);
        if(!isImgFormat) {
            console.log('does not exist in array');
            throw new Error(`${ext} is not a valid image type`);
        }

        const imgBuffer = fs.readFileSync(img);
        const imgBufferStart = imgBuffer.subarray(0, 4).toString('hex');
        const validHexSignature = ['ffd8ff','89504e47','47494638','52494646', '66747970'];
        const isValidSignature = validHexSignature.some(sig => imgBufferStart.startsWith(sig));

        if(!isValidSignature) {
            fs.unlinkSync(img);
            throw new Error('malicious file detected, deleting file...');
       }
       
       const Image = sharp(img);
       if(picType === 'profilePic' || !picType) {
        await Image
            .resize(400, 400, {fit: 'cover', position: 'attention'})
            .webp({quality: 85})
            .toFile(`../uploads/ZFA-profile-${Date.now()}.webp`);
            return;
       }

       else if(picType === 'postPic') {
        await Image.webp({quality: 85}).toFile(`../uploads/ZFA-posts-${Date.now()}.webp`);
        return;
       }

       else {
        throw new Error('unrecognized pic type...');
       }

    } catch (error) {
        console.log('Error: ',error.message);
    }
}

optimizeImg('output.jpeg', 'something')

