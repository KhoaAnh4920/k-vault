const express = require('express');
const app = express();
app.get('/chunk/:id', (req, res) => res.json({ id: req.params.id }));
app.listen(3002, () => console.log('started'));
