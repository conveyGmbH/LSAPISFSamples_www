//  server = latest.convey.de
//  apiName = apisftest
//  userName = conveyapisf1
//  password = leadsuccess

async function login() {
    const server = document.getElementById('serverName').value;
    const apiName = document.getElementById('apiName').value;
    const userName = document.getElementById('userName').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('errorMessage');

    const dataInput = {
        server,
        apiName,
        userName,
        password,
    }

    console.log("dataInput", dataInput)

    // Reset error state
    errorElement.style.display = 'none';
    errorElement.textContent = '';

    // Validation Input
    if (!server || !apiName || !userName || !password) {
        showError('Please fill in all required fields');
        return;
    }

    try {
        let uri = 'https://lstest.convey.de/apisftest/';
        let headers = new Headers();
        headers.append('Accept', 'application/json');
        let encoded = window.btoa(`${userName}:${password}`);
        let auth = 'Basic ' + encoded
        headers.append('Authorization', auth);
        console.log("auth ->", auth);

        let request = new Request(uri, {
            method: 'POST',
            headers: headers,
            credentials:'same-origin'
        });

        const response = await fetch(uri, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                server,
                apiName,
                userName,
                password
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            handleHttpError(response.status, errorData);
            return;
        }

     

        //Redirect after login success
        window.location.href = '/pages/dashboard.html';

    } catch (error) {
        handleNetworkError(error);
    }
}


function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'flex';
    document.querySelector('.card').classList.add('error-shake');
    
    setTimeout(() => {
        document.querySelector('.card').classList.remove('error-shake');
    }, 500);
}

function handleHttpError(status, errorData) {
    let message = '';
    switch (status) {
        case 400:
            message = 'Invalid request format';
            break;
        case 401:
            message = 'Invalid credentials';
            break;
        case 403:
            message = 'Access denied';
            break;
        case 404:
            message = 'API endpoint not found';
            break;
        case 500:
            message = 'Server error - please try later';
            break;
        default:
            message = `Unexpected error (${status})`;
    }
    
    if (errorData?.message) {
        message += `: ${errorData.message}`;
    }
    showError(message);
}

function handleNetworkError(error) {
    let message = 'Network error - please check your connection';
    if (error.message.includes('Failed to fetch')) {
        message = 'Cannot reach the server';
    }
    showError(message);
}
