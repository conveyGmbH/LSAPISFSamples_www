// utils/eventHandlers.js

export function setupGlobalEvents() {
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            // Clear session storage and redirect to login page
            sessionStorage.clear();
            window.location.href = 'index.html';
        });
    }
    // Add other global event handlers here if needed
}
