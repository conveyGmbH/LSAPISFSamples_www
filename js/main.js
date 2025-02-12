(function () {
    "use strict";

    let currentPage = 1;
    let data = [];
    const pageSize = 10;

    document.addEventListener("DOMContentLoaded", function () {
        const apiSelector = document.getElementById("apiSelector");
        if (apiSelector) {
            apiSelector.addEventListener('change', loadData);
            loadData();
        }

        document.getElementById("prevButton").addEventListener("click", previousPage);
        document.getElementById("nextButton").addEventListener("click", nextPage);
    });

    function loadData() {
        const apiSelector = document.getElementById("apiSelector");
        if (!apiSelector) {
            console.error("L'�l�ment #apiSelector n'a pas �t� trouv� !");
            return;
        }
        const api = apiSelector.value;
        fetch(`data/${api}.json`)
            .then((response) => response.json())
            .then((json) => {
                if (!json.d || !json.d.results) {
                    console.error("Donn�es invalides re�ues");
                    return;
                }
                data = json.d.results;
                currentPage = 1;
                renderTable();
            })
            .catch((error) => console.error("Erreur lors du chargement des donn�es :", error));
    }

    function renderTable() {
        var start = (currentPage - 1) * pageSize;
        var end = start + pageSize;
        var paginatedData = data.slice(start, end);

        var tableHead = document.getElementById("tableHead");
        var tableBody = document.getElementById("tableBody");

        tableHead.innerHTML = "";
        tableBody.innerHTML = "";

        if (paginatedData.length === 0) return;

        var columns = Object.keys(paginatedData[0]);
        var headerRow = "<tr>" + columns.map((col) => `<th>${col}</th>`).join("") + "</tr>";
        tableHead.innerHTML = headerRow;

        tableBody.innerHTML = paginatedData.map((row) => {
            return "<tr>" + columns.map((col) => `<td>${row[col] || ""}</td>`).join("") + "</tr>";
        }).join("");

        document.getElementById("pageInfo").innerText = `Page ${currentPage}`;
    }

    function nextPage() {
        if (currentPage * pageSize < data.length) {
            currentPage++;
            renderTable();
        }
    }

    function previousPage() {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    }
})();

alert