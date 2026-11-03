const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mime = require('mime-types');
const config = require('../../config/default');

/**
 * Downloads a file from Telegram and saves it into local media storage
 * @param {object} bot - TelegramBot instance
 * @param {string} fileId - Telegram file_id
 * @param {string} preferredName - Optional preferred file name
 * @returns {Promise<{ filePath: string, fileName: string, mimetype: string, size: number }>}
 */
async function downloadTelegramFile(bot, fileId, preferredName = '') {
  try {
    const fileLink = await bot.getFileLink(fileId);
    const urlParts = fileLink.split('/');
    const originalFileName = preferredName || urlParts[urlParts.length - 1] || 'file';

    const safeExt = path.extname(originalFileName) || '.bin';
    const baseName = path.basename(originalFileName, safeExt).replace(/[^a-zA-Z0-9_-]/g, '_');
    const targetFileName = `${Date.now()}_${baseName}${safeExt}`;
    const targetPath = path.join(config.paths.mediaDir, targetFileName);

    const response = await axios({
      method: 'GET',
      url: fileLink,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(targetPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const stats = fs.statSync(targetPath);
    const detectedMime = mime.lookup(targetPath) || 'application/octet-stream';

    return {
      filePath: targetPath,
      fileName: originalFileName,
      mimetype: detectedMime,
      size: stats.size
    };
  } catch (err) {
    console.error('Error downloading Telegram file:', err.message);
    throw err;
  }
}

/**
 * Inspects a Telegram message and extracts file info (Photo, Video, Document/APK, Audio)
 */
function extractMediaFromTelegramMsg(msg) {
  if (msg.photo && msg.photo.length > 0) {
    // Pick highest resolution
    const photo = msg.photo[msg.photo.length - 1];
    return {
      type: 'image',
      fileId: photo.file_id,
      fileName: 'photo.jpg',
      caption: msg.caption || ''
    };
  }

  if (msg.video) {
    return {
      type: 'video',
      fileId: msg.video.file_id,
      fileName: msg.video.file_name || 'video.mp4',
      caption: msg.caption || ''
    };
  }

  if (msg.document) {
    const docName = msg.document.file_name || 'document.bin';
    const isApk = docName.toLowerCase().endsWith('.apk');
    return {
      type: isApk ? 'apk' : 'document',
      fileId: msg.document.file_id,
      fileName: docName,
      mimetype: msg.document.mime_type || (isApk ? 'application/vnd.android.package-archive' : 'application/octet-stream'),
      caption: msg.caption || ''
    };
  }

  if (msg.audio || msg.voice) {
    const audioObj = msg.audio || msg.voice;
    return {
      type: 'audio',
      fileId: audioObj.file_id,
      fileName: audioObj.file_name || 'audio.mp3',
      isVoice: Boolean(msg.voice),
      caption: msg.caption || ''
    };
  }

  return null;
}

module.exports = {
  downloadTelegramFile,
  extractMediaFromTelegramMsg
};

