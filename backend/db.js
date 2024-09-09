// init app
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());


// CONNECT TO DB
const mysql = require('mysql');
require('dotenv').config();

const con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

con.connect(function (err) {
    if (err) throw err;
    console.log("Connected to MySQL Database!");
});


// SET WEBHOOK
app.post('/webhook/dropbox', (req, res) => {

    const changes = req.body;
    console.log('Dropbox webhook received:', changes);
    res.sendStatus(200);

});
app.get('/webhook/dropbox', (req, res) => {
    if (req.query.challenge) {
        res.send(req.query.challenge);
    } else {
        res.sendStatus(400);
    }
});


// start app
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
