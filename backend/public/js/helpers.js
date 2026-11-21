// helpers.js — Pure helpers: image/avatar paths, author, tags, ownership checks.
import { USER_ID } from './config.js';
import { h } from './dom.js';

export const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const IMG_MAX_MB = 2;
// returns a message when the file is not acceptable, '' when it is fine
export const imageError = (f) => (!IMG_TYPES.includes(f.type) ? 'Choose a JPG, PNG or WebP image.' : f.size > IMG_MAX_MB * 1024 * 1024 ? `Image must be under ${IMG_MAX_MB} MB.` : '');
// The profile picture is a file on the server, so the user object carries its path and the browser loads it
// like any other static file. Any of these keys is accepted for that path.
export const AVATAR_KEYS = ['avatar', 'avatarUrl', 'avatarPath', 'picture', 'picturePath', 'profilePicture', 'profilePic', 'imagePath', 'imageUrl'];
export const avatarOf = (u) => publicSrc(AVATAR_KEYS.map((k) => u[k]).find((v) => typeof v === 'string' && v));
// true when the user uploaded their own picture (not the shared default-avatar file)
export const hasCustomAvatar = (u) => { const a = avatarOf(u); return Boolean(a) && u.isDefaultAvatar !== true && !/(^|\/)default[-_.]/i.test(a); };
export const initialOf = (u) => (u.name || u.email || '?')[0].toUpperCase();
export const CATEGORIES = ['General', 'Workout', 'Nutrition', 'Progress', 'Question', 'Event'];
export const okUrl = (u) => /^(https?:\/\/\S+|\/(?!\/)\S+)$/i.test(u || ''); // absolute http(s) or a /path on this server
// An address THIS server really serves (a path on disk will not load). 'uploads/a.webp' and '/uploads/a.webp'
// both become '/uploads/a.webp'; full https links are kept as they are.
export const publicSrc = (v) => {
  if (typeof v !== 'string' || !v) return '';
  const src = /^https?:\/\//i.test(v) ? v : `/${v.replace(/^\/+/, '')}`;
  return okUrl(src) ? src : '';
};
export const imageSrc = (p) => publicSrc(p.imagePath ?? p.imageUrl);
// Your posts store the author as { authorId, authorName }.
export const authorOf = (it) => (typeof it.author === 'object' ? (it.author?.authorName ?? it.author?.name) : it.author) || it.authorName;
export const makeImg = (u) => h('img', { class: 'post-img', src: u, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(h('p', { class: 'muted' }, 'Image could not be loaded')) });
// tags should be an array, but a multipart form delivers text, so a server may store the raw string '["a","b"]'.
// Accept an array, JSON text or "a, b" text and always return an array of strings.
export const tagsOf = (p) => {
  let t = p.tags;
  if (typeof t === 'string') { try { t = JSON.parse(t); } catch { t = t.split(','); } }
  return Array.isArray(t) ? t.map((x) => String(x).trim()).filter(Boolean) : [];
};
// The author's picture: the server sends it with each post (authorImage, or inside the author object).
// Falls back to the initial letter if there is none or the file fails to load.
export const authorPic = (p) => publicSrc(p.authorImage ?? p.author?.authorImage ?? p.author?.image ?? p.authorPic);
export const avatarNode = (name, src) => {
  const initial = name[0].toUpperCase();
  return h('span', { class: 'avatar sm' }, src ? h('img', { src, alt: '', onerror: (e) => e.target.replaceWith(initial) }) : initial);
};

export const owner = (it) => it.author?.authorId ?? it.authorId ?? it.userId ?? it.ownerId ?? it.author?.id;
// Show Edit/Delete only on your own items. If the API sends no owner info, assume yours.
export const owned = (it) => it.isMine ?? (owner(it) === undefined || String(owner(it)) === USER_ID);
