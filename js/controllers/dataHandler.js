import ApiService from "./apiService.js";

// Function to fetch the data based on selected entity
async function fetchData(entity) {
    const serverName = document.getElementById("serverName").value.trim();
    const apiName = document.getElementById("apiName").value.trim();

    try {
        const response = await ApiService.request("GET", `${entity}?$format=json`);
        if (response && response.d && response.d.results) {
            displayData(response.d.results);
        } else {
            ApiService.showError("No data available for this entity.");
        }
    } catch (error) {
        console.error("Error fetching data:", error);
        ApiService.showError("Failed to fetch data.");
    }
}

// Function to display data in a table
function displayData(data) {
    const tableBody = document.querySelector("#dataTable tbody");
    tableBody.innerHTML = "";  // Clear existing data

    // Dynamically create table headers based on keys of the first data object
    if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const headerRow = document.querySelector("#dataTable thead tr");
        headerRow.innerHTML = headers.map(header => `<th>${header}</th>`).join("");
    }

    // Populate table rows
    data.forEach(item => {
        const row = document.createElement("tr");
        Object.values(item).forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value || "N/A";  // Handle empty values
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });

    // Initialize DataTables for pagination and sorting
    $("#dataTable").DataTable({
        paging: true,
        searching: true,
        ordering: true,
        info: true
    });
}

// Event listener for the select element to fetch data on selection change
document.getElementById("entitySelect").addEventListener("change", (e) => {
    const selectedEntity = e.target.value;
    fetchData(selectedEntity);
});

// Event listener for back button
document.getElementById("backButton").addEventListener("click", () => {
    window.history.back();
});

// Event listener for logout button
document.getElementById("logoutButton").addEventListener("click", () => {
    sessionStorage.removeItem("credentials");
    window.location.href = "/index.html";  // Redirect to login page
});

// Fetch the default entity data on page load
document.addEventListener("DOMContentLoaded", () => {
    fetchData("LS_Country");  // Initial data fetch for LS_Country
});
