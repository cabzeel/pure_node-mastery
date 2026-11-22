// config.js — Session (token + user id) and the ROUTES map. Backend paths live ONLY here.
export const BASE = location.origin;
// auth.js stores the token and the user's id in sessionStorage when you log in or sign up.
// Anything that is not real (missing, or the text "undefined"/"null") counts as logged out.
export const clean = (v) => (v && v !== 'undefined' && v !== 'null' ? v : null);
export let TOKEN = clean(sessionStorage.getItem('token'));
export const USER_ID = clean(sessionStorage.getItem('userId'));
export const setToken = (t) => { TOKEN = t; sessionStorage.setItem('token', t); }; // used when the server rotates the token
export const endSession = () => { sessionStorage.removeItem('token'); sessionStorage.removeItem('userId'); };
if (!TOKEN) endSession(); // drop any leftover junk
export const PICTURE_SET = 'PATCH'; // how a picture is set: PATCH, because every user already has a picture (the default one), so setting one is an update
export const ROUTES = {
  users: '/api/users',                        // GET (master admin only) -> all users ; GET ?q=ada (any logged-in user) -> [{ id, name }] only, used to find someone to share with ; /:id -> DELETE
  profile: `/api/users/${USER_ID}`,           // GET | PATCH {name,email} | DELETE
  password: `/api/users/${USER_ID}/password`, // PATCH {currentPassword,newPassword}
  picture: `/api/users/${USER_ID}/picture`,   // POST multipart {avatar} | DELETE (back to default). Reading it = the path on GET /api/users/:id
  posts: '/api/posts',            // GET | POST (multipart) ; /:id -> GET | PATCH (multipart) | DELETE
  workouts: '/api/workouts',      // GET | POST ; /:id -> GET | PUT | DELETE
  share: (id) => `/api/workouts/${encodeURIComponent(id)}/share`,                       // GET [{ id, name }] | POST { userId } (owner only)
  unshare: (id, uid) => `/api/workouts/${encodeURIComponent(id)}/share/${encodeURIComponent(uid)}`, // DELETE (owner only)
  comments: (id) => `/api/posts/${id}/comments`,           // GET list | POST { text }
  comment: (id, cid) => `/api/posts/${id}/comments/${cid}`, // PATCH { text } | DELETE
  replies: (id, cid) => `/api/posts/${id}/comments/${cid}/replies`,  // GET list | POST { text }. A reply is a comment too: edit, delete and like use the comment routes
  commentLike: (id, cid) => `/api/posts/${id}/comments/${cid}/like`, // POST toggles -> { success, likesCount }
  like: (id) => `/api/posts/${id}/like`, // POST toggles: likes, or unlikes if you already liked it -> { success, likesCount }
  logout: '/api/logout',          // POST
};