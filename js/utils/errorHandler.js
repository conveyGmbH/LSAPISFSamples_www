// services/errorHandler.js

export function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'flex';
    document.querySelector('.card').classList.add('error-shake');

    setTimeout(() => {
        document.querySelector('.card').classList.remove('error-shake');
    }, 500);
}

export function handleHttpError(status, errorData) {
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

export function handleNetworkError(error) {
    let message = 'Network error - please check your connection';
    if (error.message.includes('Failed to fetch')) {
        message = 'Cannot reach the server';
    }
    showError(message);
}
