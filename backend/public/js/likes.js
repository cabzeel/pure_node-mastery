// likes.js — A heart button that toggles a like with one POST. Shared by posts and comments.
import { api } from './api.js';
import { USER_ID } from './config.js';
import { iconBtn, toast } from './dom.js';

// route = null makes it inert (the live preview). render(count) draws the number wherever the caller wants it.
// The server's likesCount is the truth; without a `liked` flag, the count going up or down shows which way it toggled.
export function likeControl({ item, route, label = 'Like', render }) {
  let likes = item.likesCount ?? item.likes;
  let liked =
    item.likedByMe === true ||
    (Array.isArray(item.hasLiked) && item.hasLiked.includes(USER_ID)); // likedByMe is the field to send
  let busy = false;
  const draw = () => {
    btn.classList.toggle('liked', liked);
    render(likes);
  };
  const flip = () => {
    liked = !liked;
    if (Number.isFinite(likes)) likes += liked ? 1 : -1;
    draw();
  };
  const btn = iconBtn('heart', label, async () => {
    if (!route || busy) return;
    busy = true;
    const prev = likes;
    flip(); // instant feedback, undone if the server says no
    try {
      const d = await api('POST', route);
      const n = d.likesCount ?? d.data?.likesCount,
        l = d.liked ?? d.data?.liked;
      if (Number.isFinite(n)) {
        likes = n;
        if (typeof l !== 'boolean' && Number.isFinite(prev) && n !== prev)
          liked = n > prev;
      }
      if (typeof l === 'boolean') liked = l;
      draw();
    } catch (e) {
      flip();
      toast(e.missing ? 'Likes are not built yet' : e.message, 'bad');
    } finally {
      busy = false;
    }
  });
  draw();
  return btn;
}
