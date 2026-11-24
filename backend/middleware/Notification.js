const crypto = require('crypto');
const { USERS_DB } = require('../utils/state');
class Notification {
    constructor({message, type, actorId, resourceId, recepientId, commentId, replyId}) {
        this.id = crypto.randomUUID();
        this.createdAt = Date.now();
        this.read = false
        this.message = message;
        this.type = type;
        this.actorId = actorId;
        this.resourceId = resourceId;
        this.commentId = commentId;
        this.replyId = replyId
        this.recepientId = recepientId

    }
}

const notification = new Notification({
    message: '',
    type: '',
    actorId: crypto.randomUUID(),
    resourceId: crypto.randomUUID(),
    recepientId: crypto.randomUUID(),
    
});

module.exports = Notification