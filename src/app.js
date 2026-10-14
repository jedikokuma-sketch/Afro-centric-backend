const express = require('express');
const cors = require('cors');
const photoRoutes = require('./routes/photoRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/api/photos', photoRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
