// comments.js — The comments panel: comments, replies, likes, edit and delete.
import { api, many } from './api.js';
import { ROUTES, USER_ID } from './config.js';
import { ago, h, iconBtn, toast } from './dom.js';
import { avatarNode, avatarOf, owner, publicSrc } from './helpers.js';
import { likeControl } from './likes.js';
import { state } from './state.js';
import { dlg, errorBox } from './ui.js';

export const COMMENTS_SPEC = `GET    /api/posts/:id/comments   -> { success:true, data:[ { id, text, author:{ authorId, authorName }, createdAt, editedAt, canEdit, canDelete, likesCount, likedByMe, replyCount } ] }
POST   /api/posts/:id/comments   <- { "text": "..." } (1-500 chars) -> 201 with the new comment
GET    /api/posts/:id/comments/:commentId/replies   -> { success:true, data:[ ...same shape, without replyCount ] }
POST   /api/posts/:id/comments/:commentId/replies   <- { "text": "..." } -> 201 with the new reply
POST   /api/posts/:id/comments/:commentId/like      (toggles) -> { success:true, likesCount }
POST   /api/posts/:id/comments/:commentId/replies/:replyId/like   (toggles) -> { success:true, likesCount }
PATCH  /api/posts/:id/comments/:commentId   <- { "text": "..." }
DELETE /api/posts/:id/comments/:commentId
PATCH  /api/posts/:id/comments/:commentId/replies/:replyId   <- { "text": "..." }   (a reply is addressed THROUGH its parent comment)
DELETE /api/posts/:id/comments/:commentId/replies/:replyId

replyCount is how the panel knows WHICH comments have replies. Send it (0 when none). Without it every comment offers "View replies", and the post's comment total can't be rebuilt from the list.`;

// Opens in the shared dialog. n = comments + replies (like Instagram); onCount(n) keeps the post card's number in step.
export function openComments(p, count, onCount) {
  let exact = true; // is n built from the list? False when the server sends no replyCount: n then stays what the post card showed
  let n = count,
    target = null,
    mention = ''; // target = who I am replying to
  const off = p.allowComments === false || p.allowComments === 'false';
  const postMine = owner(p) !== undefined && String(owner(p)) === USER_ID; // I wrote this post, so I can delete any comment under it
  const rows = new Map(); // top-level comment id -> { refresh(), added(reply) }
  // Where one item lives. A comment: /comments/:commentId. A reply lives UNDER its parent: /comments/:commentId/replies/:replyId.
  const itemRoute = (c, parent) =>
    parent ? `${ROUTES.replies(p.id, parent.id)}/${c.id}` : ROUTES.comment(p.id, c.id);
  // Likes are addressed the same way: a reply is liked THROUGH its parent comment, never as if it were a top-level comment.
  const likeRoute = (c, parent) =>
    parent ? `${itemRoute(c, parent)}/like` : ROUTES.commentLike(p.id, c.id);
  const list = h('div', { class: 'comments-list' });
  const emptyNote = () =>
    h('p', { class: 'muted empty-note' }, 'No comments yet. Be the first.');
  const input = h('input', {
    type: 'text',
    maxlength: 500,
    autocomplete: 'off',
    placeholder: 'Add a comment…',
    'aria-label': 'Add a comment',
  });
  const send = h(
    'button',
    { class: 'link', type: 'submit', disabled: true },
    'Post',
  );
  const replyBar = h('div', { class: 'reply-bar', hidden: true });
  const form = h('form', { class: 'comment-form' }, input, send);
  const empty = () => {
    const t = input.value.trim();
    return !t || t === mention.trim();
  };
  input.addEventListener('input', () => {
    send.disabled = empty();
  });
  const setTarget = (t) => {
    // t = { parent, name, mention } or null
    target = t;
    mention = t?.mention ? `@${t.name} ` : '';
    replyBar.hidden = !t;
    replyBar.replaceChildren(
      ...(t
        ? [
            h('span', {}, `Replying to ${t.name}`),
            iconBtn('close', 'Cancel reply', () => setTarget(null)),
          ]
        : []),
    );
    input.placeholder = t ? `Reply to ${t.name}…` : 'Add a comment…';
    input.value = mention;
    send.disabled = empty();
    if (t) input.focus();
  };

  const row = (c, parent = null) => {
    // parent = the top-level comment when c is a reply
    if (!parent) {
      const k = c.replyCount == null ? NaN : Number(c.replyCount);
      c.replyCount = Number.isFinite(k) ? k : undefined; // a number, or undefined = "the server didn't say". Those are NOT the same as 0.
    }
    const name = String(c.author?.authorName ?? c.authorName ?? 'Someone');
    const mineC = String(c.author?.authorId ?? c.authorId) === USER_ID;
    const pic =
      publicSrc(c.author?.authorImage ?? c.authorImage ?? c.author?.image) ||
      (mineC && state.me ? avatarOf(state.me) : '');
    const textEl = h('span', {}, String(c.text ?? ''));
    const view = h('p', {}, h('strong', {}, name), ' ', textEl);
    const meta = h('small', { class: 'muted' });
    const drawMeta = () => {
      meta.textContent = [
        c.createdAt && ago(c.createdAt),
        (c.editedAt || c.edited) && 'edited',
      ]
        .filter(Boolean)
        .join(' · ');
    };
    const likeN = h('small', { class: 'muted like-n' });
    const heart = likeControl({
      item: c,
      route: likeRoute(c, parent),
      label: 'Like comment',
      render: (k) => {
        likeN.textContent = k > 0 ? String(k) : '';
      },
    });
    const actions = h(
      'span',
      { class: 'comment-actions' },
      (c.canEdit ?? mineC) &&
        iconBtn('edit', 'Edit comment', () => startEdit()), // canEdit / canDelete come from the server; fallback: edit = own, delete = own or any comment on my post
      (c.canDelete ?? (mineC || postMine)) &&
        iconBtn('trash', 'Delete comment', () => remove(c, el, parent), 'bad'),
    );
    const reply =
      !off &&
      h(
        'button',
        {
          type: 'button',
          class: 'link muted-link',
          onclick: () =>
            setTarget({ parent: parent || c, name, mention: Boolean(parent) }),
        },
        'Reply',
      );
    const box = h('div', { class: 'replies', hidden: true });
    const toggle = h('button', {
      type: 'button',
      class: 'link muted-link',
      onclick: () => flipReplies(),
    });
    let shown = false,
      loaded = false;
    const drawToggle = () => {
      const k = c.replyCount;
      toggle.hidden = k === 0; // only a known zero hides it. With no count we can't tell, so people must still be able to look
      toggle.textContent = shown
        ? 'Hide replies'
        : k == null
          ? 'View replies'
          : `View ${k} ${k === 1 ? 'reply' : 'replies'}`;
      box.hidden = !shown;
    };
    async function loadReplies() {
      box.replaceChildren(h('div', { class: 'skeleton comment-skel' }));
      try {
        const items = many(await api('GET', ROUTES.replies(p.id, c.id)));
        box.replaceChildren(
          ...(items.length
            ? items.map((r) => row(r, c))
            : [h('p', { class: 'muted empty-note' }, 'No replies yet.')]),
        );
        loaded = true;
        // Now the real number is known (also when the server never sent one). n only moves if it was built from the list.
        if (exact && c.replyCount !== items.length) {
          n += items.length - (c.replyCount ?? 0);
          onCount(n);
        }
        c.replyCount = items.length;
      } catch (e) {
        box.replaceChildren(errorBox(e, COMMENTS_SPEC, loadReplies));
      }
    }
    async function flipReplies() {
      shown = !shown;
      if (shown && !loaded) await loadReplies();
      drawToggle();
    }
    const el = h(
      'div',
      { class: 'comment' },
      avatarNode(name, pic),
      h(
        'div',
        { class: 'comment-body' },
        view,
        h('div', { class: 'comment-meta' }, meta, reply, actions),
        ...(parent ? [] : [toggle, box]),
      ),
      h('div', { class: 'comment-like' }, heart, likeN),
    );
    if (!parent) {
      rows.set(c.id, {
        refresh: drawToggle,
        async added(r) {
          c.replyCount = (c.replyCount ?? 0) + 1;
          shown = true;
          if (loaded && r) {
            box.querySelector('.empty-note')?.remove();
            box.append(row(r, c));
          }
          else await loadReplies();
          drawToggle();
        },
      });
    }
    drawMeta();
    drawToggle();

    // Edit in place: the text turns into an input. Enter or Save sends it, Esc or Cancel puts the old text back.
    function startEdit() {
      const field = h('input', {
        type: 'text',
        maxlength: 500,
        autocomplete: 'off',
        'aria-label': 'Edit comment',
      });
      field.value = String(c.text ?? '');
      const save = h('button', { class: 'link', type: 'submit' }, 'Save');
      const stop = () => {
        editForm.replaceWith(view);
        actions.hidden = false;
      };
      const editForm = h(
        'form',
        { class: 'comment-edit' },
        field,
        save,
        h(
          'button',
          { class: 'link muted-link', type: 'button', onclick: () => stop() },
          'Cancel',
        ),
      );
      editForm.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          stop();
        }
      }); // closes only the edit, not the whole panel
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = field.value.trim();
        if (!text) return toast('A comment cannot be empty.', 'bad');
        if (text === c.text) return stop(); // nothing changed, no request
        save.disabled = field.disabled = true;
        try {
          const d = await api('PATCH', itemRoute(c, parent), { text });
          const u = d.data ?? d.comment ?? {};
          c.text = typeof u.text === 'string' ? u.text : text; // the server may have cleaned the text
          c.editedAt = u.editedAt ?? Date.now();
          textEl.textContent = c.text;
          drawMeta();
          stop();
        } catch (err) {
          toast(
            err.missing ? 'Editing comments is not built yet' : err.message,
            'bad',
          );
          save.disabled = field.disabled = false;
          field.focus();
        }
      });
      view.replaceWith(editForm);
      actions.hidden = true;
      field.focus();
      field.select();
    }
    return el;
  };

  async function load() {
    list.replaceChildren(
      ...[1, 2].map(() => h('div', { class: 'skeleton comment-skel' })),
    );
    try {
      const items = many(await api('GET', ROUTES.comments(p.id)));
      list.replaceChildren(
        ...(items.length ? items.map((c) => row(c)) : [emptyNote()]),
      );
      exact = items.every((c) => c.replyCount != null); // row() has settled each count above
      if (exact) {
        n = items.reduce((t, c) => t + 1 + c.replyCount, 0);
        onCount(n); // the list is the truth
      } // else: some comments don't say how many replies they have, so keep the number the post card showed instead of an undercount
    } catch (e) {
      list.replaceChildren(errorBox(e, COMMENTS_SPEC, load));
    }
  }
  async function remove(c, el, parent) {
    try {
      await api('DELETE', itemRoute(c, parent)); // a reply is deleted through its parent comment
      el.remove();
      if (parent) {
        parent.replyCount = Math.max(0, (parent.replyCount ?? 0) - 1);
        rows.get(parent.id)?.refresh();
        n = Math.max(0, n - 1);
      } else n = Math.max(0, n - 1 - (c.replyCount ?? 0)); // a comment takes its replies with it
      onCount(n);
      if (!list.children.length) list.append(emptyNote());
    } catch (e) {
      toast(e.missing ? 'Comments are not built yet' : e.message, 'bad');
    }
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (empty()) return;
    const text = input.value.trim(),
      t = target;
    send.disabled = input.disabled = true;
    try {
      const d = await api(
        'POST',
        t ? ROUTES.replies(p.id, t.parent.id) : ROUTES.comments(p.id),
        { text },
      );
      const c = d.data ?? d.comment ?? d.reply ?? d;
      if (t) {
        await rows.get(t.parent.id)?.added(c?.id ? c : null);
        n += 1;
        onCount(n);
        setTarget(null);
      } else {
        list.querySelector('.empty-note')?.remove();
        if (c?.id) {
          list.append(row(c));
          n += 1;
          onCount(n);
        } else await load(); // no comment in the reply? reload the list
        input.value = '';
        list.scrollTop = list.scrollHeight;
      }
    } catch (err) {
      toast(err.missing ? 'Comments are not built yet' : err.message, 'bad');
    } finally {
      input.disabled = false;
      send.disabled = empty();
      input.focus();
    }
  });

  dlg.replaceChildren(
    h(
      'div',
      { class: 'sheet-body' },
      h(
        'header',
        { class: 'sheet-head' },
        h('h2', {}, 'Comments'),
        iconBtn('close', 'Close', () => dlg.close()),
      ),
      list,
      ...(off
        ? [
            h(
              'p',
              { class: 'muted sheet-note' },
              'Comments are turned off for this post.',
            ),
          ]
        : [replyBar, form]),
    ),
  );
  dlg.classList.add('sheet');
  const backdrop = (e) => {
    if (e.target === dlg) dlg.close();
  }; // a click outside the panel closes it
  dlg.addEventListener('click', backdrop);
  dlg.addEventListener(
    'close',
    () => {
      dlg.classList.remove('sheet');
      dlg.removeEventListener('click', backdrop);
    },
    { once: true },
  );
  dlg.showModal();
  load();
  if (!off) input.focus();
}