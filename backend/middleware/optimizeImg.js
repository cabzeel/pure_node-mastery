const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { PUBLIC_DIR } = require('../utils/state');

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
        const isImgFormat = imageExtensions.includes(ext);
        if(!isImgFormat) {
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
        const filePath = `/uploads/profPic/ZFA-profile-${Date.now()}.webp`
        const writePath = path.join(PUBLIC_DIR, filePath);
        await Image
            .resize(400, 400, {fit: 'cover', position: 'attention'})
            .webp({quality: 85})
            .toFile(writePath);
            fs.unlinkSync(img);
            return filePath;
       }

       else if(picType === 'postPic') {
        const filePath = `/uploads/posts/ZFA-posts-${Date.now()}.webp`;
        let writePath = path.join(PUBLIC_DIR, filePath)
        await Image.webp({quality: 85}).toFile(writePath);
        fs.unlinkSync(img)
        return filePath;
       }

       else {
        throw new Error('unrecognized pic type...');
       }

    } catch (error) {
        console.error(error)
        return;
    }
}

module.exports = optimizeImg;