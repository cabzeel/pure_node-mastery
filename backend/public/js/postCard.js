// postCard.js — One Instagram-style post card (also used by the live preview in the post form).
import { openComments } from './comments.js';
import { likeControl } from './likes.js';
import { ROUTES, USER_ID } from './config.js';
import { ago, h, iconBtn, toast } from './dom.js';
import {
  authorOf,
  authorPic,
  avatarNode,
  avatarOf,
  imageSrc,
  makeImg,
  owner,
  tagsOf,
} from './helpers.js';
import { state } from './state.js';

// One Instagram-style post: header (who + when + owner actions), square picture, actions, likes, caption, tags.
// Used by the Feed and by the live preview in the post form (o.img / o.preview).
export const postCard = (p, o = {}) => {
  const src = o.img !== undefined ? o.img : imageSrc(p) && makeImg(imageSrc(p));
  const name = String(authorOf(p) || 'Someone');
  const mine =
    o.preview || (owner(p) !== undefined && String(owner(p)) === USER_ID);
  const pic = authorPic(p) || (mine && state.me ? avatarOf(state.me) : '');
  let comments =
    p.commentCount ?? (Number.isFinite(p.comments) ? p.comments : undefined);
  const canComment = p.allowComments !== false && p.allowComments !== 'false';
  const cLink = h('button', {
    type: 'button',
    class: 'link muted-link',
    onclick: () => open(),
  });
  const drawC = () => {
    cLink.hidden = Boolean(o.preview) || !(comments > 0 || canComment);
    cLink.textContent =
      comments > 0 ? `View all ${comments} comments` : 'Add a comment…';
  };
  const open = () => {
    if (p.id)
      openComments(p, comments ?? 0, (n) => {
        comments = n;
        drawC();
      });
  }; // the live preview has no post to comment on
  drawC();
  const likeTxt = h('p', { class: 'post-likes' });
  const likeBtn = likeControl({
    item: p,
    route: p.id && ROUTES.like(p.id),
    render: (k) => {
      likeTxt.hidden = !Number.isFinite(k);
      likeTxt.textContent = `${k} ${k === 1 ? 'like' : 'likes'}`;
    },
  });
  const tags = tagsOf(p);
  return h(
    'article',
    { class: 'post-card' },
    h(
      'header',
      { class: 'post-head' },
      avatarNode(name, pic),
      h(
        'div',
        { class: 'post-who' },
        h('strong', {}, name),
        p.createdAt && h('small', { class: 'muted' }, ago(p.createdAt)),
      ),
      (o.onEdit || o.onDel) &&
        h(
          'div',
          { class: 'row' },
          o.onEdit && iconBtn('edit', 'Edit post', o.onEdit),
          o.onDel && iconBtn('trash', 'Delete post', o.onDel, 'bad'),
        ),
    ),
    src && h('div', { class: 'post-media' }, src),
    h(
      'div',
      { class: 'post-actions' },
      likeBtn,
      iconBtn('comment', 'Comments', open),
      h('span', { class: 'grow' }),
      iconBtn('bookmark', 'Save', () => toast('Saving posts is coming soon')),
    ),
    likeTxt,
    h(
      'div',
      { class: 'post-text' },
      h('h3', {}, p.title || 'Untitled'),
      h('p', { class: 'post' }, p.body),
    ),
    tags.length > 0 &&
      h(
        'div',
        { class: 'tags' },
        tags.map((t) => h('span', { class: 'tag' }, `#${t}`)),
      ),
    h(
      'div',
      { class: 'post-meta' },
      p.category && h('span', { class: 'chip' }, p.category),
      cLink,
    ),
  );
};
