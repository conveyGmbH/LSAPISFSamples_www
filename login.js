import { ApiService } from "./apiService.js";

fetch("https://lstest.convey.de/apisftest/", {
  method: "GET",
  headers: {
    Accept: "application/json",
    Authorization: `Basic ${sessionStorage.getItem("credentials")}`,
  },
})
  .then((res) => res.json())
  .then(console.log)
  .catch(console.error);


export async function login() {
    console.log("Login function called!");
    try {
        const userName = document.getElementById("userName").value.trim();
        const password = document.getElementById("password").value.trim();

        if (!userName || !password) {
            ApiService.showError("Veuillez remplir tous les champs.");
            return;
        }

        const credentials = btoa(`${userName}:${password}`);
        sessionStorage.setItem("credentials", credentials);

        console.log(" try connexion...");

        const response = await ApiService.request("GET", "");

        console.log("Réponse API:", response);

        if (!response) {
            return; 
        }

        document.getElementById("userName").value = "";
        document.getElementById("password").value = "";

        window.location.href = "/pages/display.html";
    } catch (error) {
        console.error("Error connection:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const loginButton = document.getElementById("loginButton");
    if (loginButton) {
        loginButton.addEventListener("click", login);
    }
});

window.login = login; 


console.log("Script loaded!");