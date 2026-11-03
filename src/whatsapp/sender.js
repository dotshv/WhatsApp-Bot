const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { cleanPhone, phoneToJid } = require('../utils/formatter');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Unified sender for WhatsApp Baileys socket.
 * Handles Text, Photo, Video, Audio, and Documents (APK, PDF, ZIP, etc.).
 * Automatically resolves and normalizes recipient JIDs (supports LID, E.164, and onWhatsApp validation).
 */
const WhatsAppSender = {
  /**
   * Resolves recipient into a valid WhatsApp JID (phone@s.whatsapp.net or lid@lid)
   */
  async resolveRecipientJid(sock, target) {
    if (!target) throw new Error('Recipient target is required');
    let raw = '';
    if (typeof target === 'object') {
      raw = target.jid || target.phone || '';
    } else {
      raw = String(target).trim();
    }
    if (!raw) throw new Error('Invalid recipient target');

    // If already formatted with domain (e.g. @s.whatsapp.net or @lid), return directly
    if (raw.includes('@')) {
      return raw;
    }

    const cleaned = cleanPhone(raw);
    if (!cleaned) throw new Error(`Invalid phone number: ${raw}`);

    // If 14+ digits not starting with 91, this is an LID
    if (cleaned.length >= 14 && !cleaned.startsWith('91')) {
      return `${cleaned}@lid`;
    }

    // Try verifying on WhatsApp to get the canonical JID
    let resolvedJid = `${cleaned}@s.whatsapp.net`;
    if (sock && typeof sock.onWhatsApp === 'function') {
      try {
        const results = await sock.onWhatsApp(cleaned);
        if (Array.isArray(results) && results.length > 0) {
          const match = results.find(r => r.exists);
          if (match && match.jid) {
            resolvedJid = match.jid;
          }
        }
      } catch (_) {}
    }

    return resolvedJid;
  },

  /**
   * Send plain text message
   */
  async sendText(sock, target, text) {
    if (!sock || !target || !text) throw new Error('Missing socket, recipient, or text');
    const jid = await this.resolveRecipientJid(sock, target);
    return await sock.sendMessage(jid, { text: String(text) });
  },

  /**
   * Send image file with optional caption
   */
  async sendImage(sock, target, filePath, caption = '') {
    if (!sock || !target || !filePath) throw new Error('Missing socket, recipient, or filePath');
    if (!fs.existsSync(filePath)) throw new Error(`Media file not found: ${filePath}`);

    const jid = await this.resolveRecipientJid(sock, target);
    const buffer = fs.readFileSync(filePath);
    return await sock.sendMessage(jid, {
      image: buffer,
      caption: caption || undefined
    });
  },

  /**
   * Send video file with optional caption
   */
  async sendVideo(sock, target, filePath, caption = '') {
    if (!sock || !target || !filePath) throw new Error('Missing socket, recipient, or filePath');
    if (!fs.existsSync(filePath)) throw new Error(`Video file not found: ${filePath}`);

    const jid = await this.resolveRecipientJid(sock, target);
    const buffer = fs.readFileSync(filePath);
    return await sock.sendMessage(jid, {
      video: buffer,
      caption: caption || undefined
    });
  },

  /**
   * Send document / APK / PDF with proper MIME and file name
   */
  async sendDocument(sock, target, filePath, fileName = '', mimetype = '', caption = '') {
    if (!sock || !target || !filePath) throw new Error('Missing socket, recipient, or filePath');
    if (!fs.existsSync(filePath)) throw new Error(`Document file not found: ${filePath}`);

    const jid = await this.resolveRecipientJid(sock, target);
    const finalName = fileName || path.basename(filePath);
    let finalMime = mimetype;
    if (!finalMime || finalMime === 'application/octet-stream') {
      if (finalName.toLowerCase().endsWith('.apk')) {
        finalMime = 'application/vnd.android.package-archive';
      } else {
        finalMime = mime.lookup(filePath) || 'application/octet-stream';
      }
    }

    const buffer = fs.readFileSync(filePath);
    return await sock.sendMessage(jid, {
      document: buffer,
      fileName: finalName,
      mimetype: finalMime,
      caption: caption || undefined
    });
  },

  /**
   * Send audio or voice note
   */
  async sendAudio(sock, target, filePath, isVoice = false) {
    if (!sock || !target || !filePath) throw new Error('Missing socket, recipient, or filePath');
    if (!fs.existsSync(filePath)) throw new Error(`Audio file not found: ${filePath}`);

    const jid = await this.resolveRecipientJid(sock, target);
    const buffer = fs.readFileSync(filePath);
    return await sock.sendMessage(jid, {
      audio: buffer,
      mimetype: 'audio/mp4',
      ptt: Boolean(isVoice)
    });
  },

  /**
   * Send any structured step (used in Auto-Reply flow and Broadcast)
   * @param {object} sock - Baileys socket
   * @param {string|object} target - WhatsApp JID or recipient object
   * @param {object} step - { type: 'text'|'image'|'video'|'document'|'apk'|'audio', content, filePath, caption, fileName, mimetype }
   */
  async sendStep(sock, target, step) {
    if (!sock || !target || !step) return;

    switch (step.type) {
      case 'text':
        return await this.sendText(sock, target, step.content || step.caption || '');
      
      case 'image':
      case 'photo':
        return await this.sendImage(sock, target, step.filePath, step.caption || '');

      case 'video':
        return await this.sendVideo(sock, target, step.filePath, step.caption || '');

      case 'document':
      case 'apk':
        return await this.sendDocument(
          sock,
          target,
          step.filePath,
          step.fileName,
          step.mimetype,
          step.caption || ''
        );

      case 'audio':
      case 'voice':
        return await this.sendAudio(sock, target, step.filePath, step.isVoice);

      default:
        if (step.filePath) {
          return await this.sendDocument(sock, target, step.filePath, step.fileName, step.mimetype, step.caption);
        } else if (step.content) {
          return await this.sendText(sock, target, step.content);
        }
    }
  },

  sleep
};

module.exports = WhatsAppSender;

