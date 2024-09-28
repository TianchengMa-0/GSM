// init app
const express = require('express');
const bodyParser = require('body-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const axios = require('axios');
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


// SET WEBHOOK: check update on specified file types (normally .xlsx), download the file and update DB
app.post('/webhook/dropbox', async (req, res) => {
    const changes = req.body;
    console.log(changes.list_folder);

    try {
        await listFiles()
    } catch (error) {
        console.error('Error processing webhook event:', error);
    }
});


const accessToken = ''; // Replace with your actual access token

const folderPath = '/test';
// get all files in folder and download the most recently updated one
async function listFiles() {
    try {
        // get list of files
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

        // Filter `.xlsx` files and find the most recent one
        const files = response.data.entries.filter(
            (file) => file['.tag'] === 'file' && file.name.endsWith('.xlsx')
        );
        // console.log(files);
        if (files.length === 0) {
            console.log('No .xlsx files found in the folder.');
            return;
        }

        // Sort by server_modified date in descending order (most recent first)
        files.sort((a, b) => new Date(b.server_modified) - new Date(a.server_modified));

        // Get the most recent .xlsx file
        const mostRecentFile = files[0];
        console.log(`Most recent .xlsx file: ${mostRecentFile.name}`);

        // Download the most recent .xlsx file
        await downloadFile(mostRecentFile.path_lower, mostRecentFile.server_modified);

    } catch (error) {
        console.error('Error listing files:', error.response ? error.response.data : error.message);
    }
}


// download a file from Dropbox with dropboxFilePath and save file with given modifiedDate 
async function downloadFile(dropboxFilePath, modifiedDate) {
    try {
        console.log(dropboxFilePath);
        console.log(modifiedDate);
        const response = await axios.post(
            'https://content.dropboxapi.com/2/files/download',
            null,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Dropbox-API-Arg': JSON.stringify({ path: dropboxFilePath }),
                    'Content-Type': 'application/octet-stream'
                },

                responseType: 'stream', // Important to handle the file as a stream
            }
        );
        // Create a timestamped local file name based on the modified date
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
        // TODO: parse and save file
    } catch (error) {
        console.error('Error downloading file:', error);
    }
}


// Function to parse the Excel file, create a new table, and insert data
async function parseExcelAndCreateTable(fileContent, fileName) {
    try {
        // Save the file temporarily to the local filesystem
        const tempFilePath = 'temp.xlsx';
        fs.writeFileSync(tempFilePath, fileContent);

        // Read the Excel file
        const workbook = xlsx.readFile(tempFilePath);
        const sheetName = workbook.SheetNames[0]; // Assume the first sheet
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        // Extract column names from the first row
        const columnNames = data[0];

        // Generate a unique table name (e.g., using the file name and timestamp)
        const tableName = `table_${fileName.replace(/\W/g, '_')}_${Date.now()}`;

        // Create the table dynamically with the extracted column names
        let createTableQuery = `CREATE TABLE ${tableName} (`;
        columnNames.forEach((column, index) => {
            createTableQuery += `\`${column.replace(/\W/g, '_')}\` TEXT`;
            if (index < columnNames.length - 1) createTableQuery += ', ';
        });
        createTableQuery += ');';

        // Execute the query to create the table
        con.query(createTableQuery, (err, result) => {
            if (err) throw err;
            console.log(`Table ${tableName} created successfully`);

            // Insert the data into the new table
            insertDataIntoTable(tableName, data);
        });

        // Delete the temporary file
        fs.unlinkSync(tempFilePath);
    } catch (error) {
        console.error('Error parsing Excel file or creating table:', error.message);
    }
}

// Function to insert data into the newly created table
function insertDataIntoTable(tableName, data) {
    // Prepare SQL INSERT statement
    const columnNames = data[0].map(column => `\`${column.replace(/\W/g, '_')}\``).join(', ');

    const insertQuery = `INSERT INTO ${tableName} (${columnNames}) VALUES ?`;

    // Convert rows of data after the header row
    const rows = data.slice(1); // Skip the header row

    con.query(insertQuery, [rows], (err, result) => {
        if (err) throw err;
        console.log(`${result.affectedRows} rows inserted into ${tableName}`);
    });
}


// triggered for first time webhook verification from dropbox application
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
