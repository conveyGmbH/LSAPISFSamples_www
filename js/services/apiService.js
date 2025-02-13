// services/apiService.js

import { handleHttpError, handleNetworkError } from './errorHandler.js';

export async function apiService(uri, method = 'GET', data = null) {
    const headers = new Headers();
    headers.append('Accept', 'application/json');
    headers.append('Content-Type', 'application/json');

    // Retrieve credentials
    const userName = document.getElementById('userName')?.value;
    const password = document.getElementById('password')?.value;
    const encoded = window.btoa(`${userName}:${password}`);
    headers.append('Authorization', 'Basic ' + encoded);

    const options = {
        method: method,
        headers: headers,
        credentials: 'same-origin',
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch('https://lstest.convey.de/apisftest/', options);
        if (response.ok) {
            const jsonData = await response.json();
            return jsonData;
        } else {
            // Attempt to parse error details
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = null;
            }
            handleHttpError(response.status, errorData);
            throw new Error(`HTTP error ${response.status}`);
        }
    } catch (error) {
        handleNetworkError(error);
        throw error;
    }
}
