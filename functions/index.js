/* eslint-disable consistent-return */
/* eslint-disable promise/always-return */
const functions = require('firebase-functions');
const { db } = require('./utils/admin.js');
const {
  getAllPosts,
  addPost,
  getPost,
  commentOnPost,
  likePost,
  unLikePost,
  deletePost
} = require('./handlers/posts');
const {
  login,
  signUp,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationsRead
} = require('./handlers/users');
const { addMessage } = require('./handlers/messages');

const fbAuth = require('./utils/fbAuth');

const app = require('express')();
const cors = require('cors');
app.use(cors());

// posts routes
app.get('/posts', getAllPosts);
app.post('/post', fbAuth, addPost);
app.get('/post/:postId', getPost);
app.delete('/post/:postId', fbAuth, deletePost);
app.get('/post/:postId/like', fbAuth, likePost);
app.get('/post/:postId/unlike', fbAuth, unLikePost);
app.post('/post/:postId/comment', fbAuth, commentOnPost);

// users routes
app.post('/signup', signUp);
app.post('/login', login);
app.post('/user/image', fbAuth, uploadImage);
app.post('/user', fbAuth, addUserDetails);
app.get('/user', fbAuth, getAuthenticatedUser);
app.get('/user/:username', getUserDetails);
app.post('/notifications', fbAuth, markNotificationsRead);

//Messages
app.post('/message', fbAuth, addMessage);

exports.api = functions.region('europe-west1').https.onRequest(app);

exports.createNoficationOnLike = functions
  .region('europe-west1')
  .firestore.document(`likes/{id}`)
  .onCreate(snapshot => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then(doc => {
        if (doc.exists && doc.data().userName !== snapshot.data().userName) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createAt: new Date().toISOString(),
            recipient: snapshot.data().userName,
            sender: snapshot.data().userName,
            type: 'like',
            read: false,
            postId: doc.id
          });
        }
      })
      .catch(err => {
        console.error(err);
      });
  });

exports.deleteNotificationOnUnlike = functions
  .region('europe-west1')
  .firestore.document(`likes/{id}`)
  .onDelete(snapshot => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch(err => {
        console.error(err);
        return;
      });
  });

exports.createNoficationOnComment = functions
  .region('europe-west1')
  .firestore.document(`comments/{id}`)
  .onCreate(snapshot => {
    return db
      .doc(`/posts/${snapshot.data().postId}`)
      .get()
      .then(doc => {
        if (doc.exists && doc.data().userName !== snapshot.data().userName) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createAt: new Date().toISOString(),
            recipient: snapshot.data().userName,
            sender: snapshot.data().userName,
            type: 'comment',
            read: false,
            postId: doc.id
          });
        }
      })
      .catch(err => {
        console.error(err);
        return;
      });
  });

//Trgger on change image
exports.onUserImageChange = functions
  .region('europe-west1')
  .firestore.document('/users/{userId}')
  .onUpdate(change => {
    console.log(change.before.data());
    console.log(change.after.data());
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log('image has changed');
      const batch = db.batch();
      return db
        .collection('posts')
        .where('userName', '==', change.before.data().username)
        .get()
        .then(data => {
          data.forEach(doc => {
            const post = db.doc(`/posts/${doc.id}`);
            batch.update(post, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        });
    } else return true;
  });

//Trigger on post delete
exports.onPostDelete = functions
  .region('europe-west1')
  .firestore.document('/posts/{postId}')
  .onDelete((snapshot, context) => {
    const postId = context.params.postId;
    const batch = db.batch();
    return db
      .collection('comments')
      .where('postId', '==', postId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection('likes')
          .where('postId', '==', postId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection('notifications')
          .where('postId', '==', postId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch(err => console.error(err));
  });
