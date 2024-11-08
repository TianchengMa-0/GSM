how to use this project assuming you have all credentials needed and all configuration setup:
login to dropbox app console, get into application, generate a new token, add new token into .env file
then make sure mysql is running, inside project terminal "cd backend" and "node db.js", you should see project running
open cmd, type "ngrok http <port number>" and the project will be posted publicly
copy the public url of project and add "/webhook/dropbox" at the end for form a new webhook url
open dropbox application, scroll to webhook and add this webhook url to it and you should be able to make it enabled.
try to make update on xlsx files on shared folder, like uploading a file to it, then webhook should be triggered and download will be processed automatically. 

install mysql 
install dropbox

install ngrok for temp localhost expose to public for testing dropbox webhook, place exe file to environment path
ngrok config add-authtoken YOUR_AUTH_TOKEN(refer .env)
start backend with port number
ngrok http PORT_NUMBER

to trigger webhook in current account A when other account B shares files, first in B create a folder and share the folder with A, then A needs to join the folder manually, then when B submit changes in this folder, A will be notified immediately.   
