import ApiService from "../services/apiService.js";

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.getElementById("loginButton").addEventListener("click", login);
}

async function login() {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) errorElement.style.display = "none";

  const serverName = getInputValue("serverName");
  const apiName = getInputValue("apiName");
  const userName = getInputValue("userName");
  const password = getInputValue("password");

  if (!serverName || !apiName || !userName || !password) {
    return displayError("Please fill in all fields.");
  }

  try {
    const credentials = btoa(`${userName}:${password}`);
    saveSessionData(serverName, apiName, credentials, userName);
    const apiService = new ApiService(serverName, apiName);
    const response = await apiService.request("GET", "");

    if (response) {
      clearInputs(["serverName", "apiName", "userName", "password"]);
      window.location.href = "/pages/display.html";
    }
  } catch (error) {
    console.error("Error during connection:", error);
    displayError("Error during connection. Please try again.");
  }
}

function getInputValue(id) {
  return document.getElementById(id).value.trim();
}

function saveSessionData(serverName, apiName, credentials, userName) {
  sessionStorage.setItem("serverName", serverName);
  sessionStorage.setItem("apiName", apiName);
  sessionStorage.setItem("credentials", credentials);
  sessionStorage.setItem("userName", userName);
}

function clearInputs(ids) {
  ids.forEach(id => document.getElementById(id).value = "");
}

function displayError(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";
  }
}