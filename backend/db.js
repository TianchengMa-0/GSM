// How the project works: 
// when client shares new xlsx files to dropbox account, webhook will listen to this update and trigger download functions to save files locally; 
// after downloading finished, it will parse the file and save it into mysql with proper format
// 
// How to run the project given all setup done:
// 1. login to dropbox app console, get into application, generate a new token, add new token into .env file
// 2. make sure mysql is running, inside project terminal "cd backend" and "node db.js", you should see project running
// 3. open cmd, type "ngrok http <port number>" and the project will be posted publicly
// 4. copy the public url of project and add "/webhook/dropbox" at the end to form a new webhook url
// 5. open dropbox application, scroll to webhook and add this webhook url to it and you should be able to make it enabled.
// 6. try to make update on xlsx files on shared folder, like uploading a file, then webhook should be triggered and download will be processed automatically. 
const express = require('express');
const bodyParser = require('body-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();
const app = express();
app.use(bodyParser.json());

// triggered for first time webhook verification from dropbox application
app.get('/webhook/dropbox', (req, res) => {
    if (req.query.challenge) {
        res.send(req.query.challenge);
    } else {
        res.sendStatus(400);
    }
});

// WEBHOOK: check update on specified file types (normally .xlsx)
// once triggered, call later functions to download and save recently updated file, only support xlsx
app.post('/webhook/dropbox', async (req, res) => {
    const changes = req.body;
    console.log(changes.list_folder);
    try {
        await listFiles()
    } catch (error) {
        console.error('Error processing webhook event:', error);
    }
});


const accessToken = process.env.DROPBOX_TOKEN; // Replace with your actual access token
const folderPath = process.env.FOLDER_PATH;
// get all files in folder and download the most recently updated one
async function listFiles() {
    try {
        const response = await axios.post(
            'https://api.dropboxapi.com/2/files/list_folder',
            { path: folderPath },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        // Filter `.xlsx` files
        const files = response.data.entries.filter(
            (file) => file['.tag'] === 'file' && file.name.endsWith('.xlsx')
        );
        if (files.length === 0) {
            console.log('No .xlsx files found in the folder.');
            return;
        }
        // Sort by server_modified date in descending order to get most recent file
        files.sort((a, b) => new Date(b.server_modified) - new Date(a.server_modified));
        const mostRecentFile = files[0];
        console.log(`Most recent .xlsx file: ${mostRecentFile.name}`);
        // Download parameter: file path and date updated 
        await downloadFile(mostRecentFile.path_lower, mostRecentFile.server_modified);
    } catch (error) {
        console.error('Error listing files:', error.response ? error.response.data : error.message);
    }
}

// download a file from Dropbox with dropboxFilePath and save file with given modifiedDate 
async function downloadFile(dropboxFilePath, modifiedDate) {
    try {
        const response = await axios.post(
            'https://content.dropboxapi.com/2/files/download',
            null,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({ path: dropboxFilePath }),
                    'Content-Type': 'application/octet-stream'
                },
                responseType: 'stream',
            }
        );
        // generate timestamp based on modifiedDate->generate local file name
        const timestamp = new Date(modifiedDate).toISOString().replace(/[:.]/g, '-');
        const localFileName = `downloaded-file-${timestamp}.xlsx`;
        // save the file to the local system
        const writer = fs.createWriteStream(localFileName);
        response.data.pipe(writer);
        writer.on('finish', () => {
            console.log(`File downloaded successfully as ${localFileName}`);
        });
        writer.on('error', (error) => {
            console.error('Error writing file:', error);
        });
        // parse and save file
        await parseExcelAndCreateTable(localFileName);
    } catch (error) {
        console.error('Error downloading file:', error);
    }
}


// Function to parse the Excel file, create a new table
async function parseExcelAndCreateTable(fileName) {
    try {
        // CONNECT TO DB
        const mysql = require('mysql');
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
        // parse file into json
        const filePath = fileName;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);
        // get col names
        const columnNames = Object.values(data[0]);
        // create table
        const createTableColumns = columnNames.map(column => `\`${column}\` VARCHAR(255)`).join(', ');
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS excel_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ${createTableColumns}
            );
            `;
        con.query(createTableQuery, (err) => {
            if (err) throw err;
            console.log('Table created or already exists');
        });
        // insert data
        data.slice(1).forEach((row) => {
            const values = Object.values(row);
            const insertQuery = `
                INSERT INTO excel_data (${columnNames.map(col => `\`${col}\``).join(', ')})
                VALUES (${columnNames.map(() => '?').join(', ')});
                `;

            con.query(insertQuery, values, (err, results) => {
                if (err) throw err;
                console.log('Row inserted:', results.insertId);
            });
        });
        // stop connection
        con.end();
    } catch (error) {
        console.error('Error parsing Excel file or creating table:', error.message);
    }
}

// start app
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
