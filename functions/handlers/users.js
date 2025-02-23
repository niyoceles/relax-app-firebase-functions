/* eslint-disable consistent-return */
/* eslint-disable promise/always-return */
/* eslint-disable promise/catch-or-return */
const firebase = require('firebase');
const { db, admin } = require('../utils/admin');
const config = require('../utils/config');

const {
  validateSignupData,
  validateLogin,
  reduceUserDetails
} = require('../utils/validators');

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  };
  //login validation
  const { valid, errors } = validateLogin(user);
  if (!valid) return res.status(400).json({ errors });

  // login
  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken();
    })
    .then(token => {
      return res.json({ token });
    })
    .catch(err => {
      if (err.code === 'auth/user-not-user') {
        res.status(403).json({
          errors: {
            general: 'you are not registered here, please create an account'
          }
        });
      }
      if (err.code === 'auth/wrong-password') {
        res
          .status(403)
          .json({ errors: { general: 'Wrong credentials, please try again' } });
      } else {
        console.log(err);
        res.status(500).json({
          errors: { general: 'Something went wrong, please try again' }
        });
      }
    });
};

//Sign up
exports.signUp = async (req, res) => {
  const newUser = {
    email: req.body.email,
    sex: req.body.sex,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    username: req.body.username
  };

  // Varidation
  const { valid, errors } = validateSignupData(newUser);
  if (!valid) return res.status(400).json({ errors });
  const noImg = 'no-img.png';

  let token, userId;
  await db
    .doc(`/users/${newUser.username}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res
          .status(400)
          .json({ username: 'this username is already taken' });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then(data => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then(idToken => {
      token = idToken;
      const userCredentials = {
        username: newUser.username,
        sex: newUser.sex,
        email: newUser.email,
        createAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId
      };
      return db.doc(`/users/${newUser.username}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch(err => {
      if (err.code === 'auth/email-already-in-use') {
        res.status(400).json({ errors: { general: 'Email is already used!' } });
      }
      console.log(err);
      return res.status(500).json({ errors: { general: err.code } });
    });
};

//Add user Details
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);
  db.doc(`/users/${req.user.username}`)
    .update(userDetails)
    .then(() => {
      return res.status(200).json({ message: 'Details added successful' });
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

// Get any user's details
exports.getUserDetails = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.username}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData.user = doc.data();
        return db
          .collection('posts')
          .where('userName', '==', req.params.username)
          .orderBy('createdAt', 'desc')
          .get();
      } else {
        return res.status(404).json({ errror: 'User not found' });
      }
    })
    .then(data => {
      userData.posts = [];
      data.forEach(doc => {
        userData.posts.push({
          body: doc.data().body,
          createdAt: doc.data().createdAt,
          userName: doc.data().userName,
          userImage: doc.data().userImage,
          likeCount: doc.data().likeCount,
          commentCount: doc.data().commentCount,
          postId: doc.id
        });
      });
      return res.json(userData);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//// Get own user details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.username}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection('likes')
          .where('userName', '==', req.user.username)
          .get();
      }
    })
    .then(data => {
      userData.likes = [];
      data.forEach(doc => {
        userData.likes.push(doc.data());
      });
      return db
        .collection('notifications')
        .where('recipient', '==', req.user.username)
        .orderBy('createAt', 'desc')
        .limit(10)
        .get();
    })
    .then(data => {
      userData.notifications = [];
      data.forEach(doc => {
        userData.notifications.push({
          recipient: doc.data().recipient,
          sender: doc.data().sender,
          createAt: doc.data().createAt,
          creamId: doc.data().creamId,
          type: doc.data().type,
          read: doc.data().read,
          notificationId: doc.id
        });
      });
      return res.json(userData);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

//Update user profile
exports.uploadImage = (req, res) => {
  const BusBoy = require('busboy');
  const path = require('path');
  const os = require('os');
  const fs = require('fs');

  const busboy = new BusBoy({ headers: req.headers });
  let imageFileName;
  let imageToBeUploaded = {};
  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    // allow only image
    if (mimetype !== `image/jpeg` && mimetype !== `image/png`) {
      return res.status(400).json({ error: 'Wrong type of file submitted' });
    }
    const imageExtension = filename.split('.')[filename.split('.').length - 1];
    imageFileName = `${Math.round(
      Math.random() * 100000000000
    )}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  busboy.on('finish', () => {
    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype
          }
        }
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.username}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: 'Image uploaded successfully' });
      })
      .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });
  busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach(notificationId => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: 'Notifications marked read' });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
