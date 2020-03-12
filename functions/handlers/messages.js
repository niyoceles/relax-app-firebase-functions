/* eslint-disable promise/always-return */
const { db } = require('../utils/admin');

// add message
exports.addMessage = (req, res) => {
  const newMessage = {
    from: req.user.username,
    to: req.body.to,
    textMessage: req.body.textMessage,
    createAt: new Date().toISOString()
  };
  db.collection('messages')
    .doc(newMessage.from)
    .collection(newMessage.to)
    .add(newMessage)
    .then(doc => {
      const resMessage = newMessage;
      resMessage.messageId = doc.id;
      res.json(resMessage);
    })
    .catch(err => {
      res.status(500).json({ error: 'something went wrong!' });
      console.error(err);
    });
};
