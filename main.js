// main.js

//  serverName = lstest.convey.de
//  apiName = apisftest
//  userName = conveyapisf1
//  password = leadsuccess

import { initializeDisplay } from './js/controllers/displayController.js';
import { login } from './js/controllers/loginController.js';
import { setupGlobalEvents } from './js/utils/eventHandlers.js';


// Global configuration
const appConfig = {
    apiBaseUrl: 'https://lstest.convey.de/apisftest/',
};

function initApp() {
    window.appConfig = appConfig;

    setupGlobalEvents();

    const currentPage = window.location.pathname;

    if (currentPage.endsWith('index.html') || currentPage === '/') {
        // Login page
        const loginButton = document.getElementById('loginButton');
        if (loginButton) {
            loginButton.addEventListener('click', login);
        }
    } else if (currentPage.endsWith('display.html')) {
        // Data display page
        initializeDisplay();
    }
}

// Execute initApp when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initApp);



export function fetchUsersData(){
    let uri = 'https://lstest.convey.de/apisftest/';
    const userName = document.getElementById('userName').value = '';
    const password = document.getElementById('password').value = '';


    let headers = new Headers();
    headers.append('Accept', 'application/json');
    let encoded = window.btoa(`${userName}:${password}`);
    let auth = 'Basic ' + encoded
    headers.append('Authorization', auth);
    console.log("auth ->", auth);
    

    let request = new Request(uri, {
        method: 'GET',
        headers: headers,
        credentials:'same-origin'
    });

    fetch(request).then((response)=> {

        console.log("response", response)
        if(response.ok){
            return response.json();
        }else{
            throw new Error('BAD HTTP Stuff');
        }
    }).then((jsonData)=>{
        console.log("jsonData fetch", jsonData);
        p.textContent = JSON.stringify(jsonData, null, 4);
    }).catch((error)=>{
        console.log("Error Display data")
    })
    
}

