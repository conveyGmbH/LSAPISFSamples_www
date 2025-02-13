

import { apiService } from "../services/apiService.js";


export async function login() {
    // const serverName = document.getElementById('serverName').value;
    // const apiName = document.getElementById('apiName').value;

    const userName = document.getElementById('userName').value = '';
    const password = document.getElementById('password').value = '';
    const uri = `${userName}:${password}`;

    try {
        const data = await apiService(uri);
        console.log("add", data)

        // Save data in sessionStorage to use on the new page
        sessionStorage.setItem('apiData', JSON.stringify(data));

        // Clear the input fields
        // document.getElementById('serverName').value = '';
        // document.getElementById('apiName').value = '';
        document.getElementById('userName').value = '';
        document.getElementById('password').value = '';

        // Redirect to the display page
        window.location.href = 'display.html';
    } catch (error) {
        // Errors are already handled in apiService, no need to handle them here
        console.error('Error during login:', error);
    }
}
