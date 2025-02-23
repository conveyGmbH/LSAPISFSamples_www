import ApiService from "../services/apiService.js";


// Login function
async function login() {
  console.log('Login function called!');
  const errorElement = document.getElementById('errorMessage');
  if (errorElement) errorElement.style.display = 'none';

  try {
    const serverName = document.getElementById('serverName').value.trim();
    const apiName = document.getElementById('apiName').value.trim();
    const userName = document.getElementById('userName').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!serverName || !apiName || !userName || !password) {
      // Show an error message if any fields are empty
      if (errorElement) {
        errorElement.textContent = 'Please fill in all fields.';
        errorElement.style.display = 'block';
      }
      return;
    }

    // Encode credentials in Base64
    const credentials = btoa(`${userName}:${password}`);
    sessionStorage.setItem('credentials', credentials);
    sessionStorage.setItem('serverName', serverName);
    sessionStorage.setItem('apiName', apiName);

    // Create an instance of ApiService
    const apiService = new ApiService(serverName, apiName);

    // Check connection by making a test request
    const response = await apiService.request('GET', '');

    if (response) {
      // Clear input fields after successful connection
      document.getElementById('serverName').value = '';
      document.getElementById('apiName').value = '';
      document.getElementById('userName').value = '';
      document.getElementById('password').value = '';

      // Successful connection, redirect to display page
      window.location.href = '/pages/display.html';
    } else {
      // Error is already handled in ApiService
    }
  } catch (error) {
    console.error('Error during connection:', error);
    // Optionally, display an error message to the user
    if (errorElement) {
      errorElement.textContent = 'Error during connection. Please try again.';
      errorElement.style.display = 'block';
    }
  }
}

// Add event listener to the login button
document.getElementById('loginButton').addEventListener('click', login);

// Export the function to be globally accessible if needed
export { login };
