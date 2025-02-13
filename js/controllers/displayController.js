// controllers/displayController.js

import { apiService } from '../services/apiService.js';
import { handleNetworkError } from '../services/errorHandler.js';

export function initializeDisplay() {
    try {
        const data = JSON.parse(sessionStorage.getItem('apiData'));

        if (data && data.d) {
            // Fill the select element
            const select = document.getElementById('dataSelect');

            if (data.d.EntitySets) {
                // If the response contains a list of entity sets
                data.d.EntitySets.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item;
                    option.textContent = item;
                    select.appendChild(option);
                });

                // Load data when an option is selected
                select.addEventListener('change', async () => {
                    const selectedEntity = select.value;
                    await loadEntityData(selectedEntity);
                });
            } else if (data.d.results) {
                // If the response contains results directly
                populateDataTable(data.d.results);
            }
        } else {
            throw new Error('No data found in sessionStorage.');
        }
    } catch (error) {
        console.error('Error loading data:', error);
        // Display an error message to the user if needed
    }
}

async function loadEntityData(entityName) {
    const uri = `${window.appConfig.apiBaseUrl}${entityName}?$format=json`;
    try {
        const data = await apiService(uri);
        if (data && data.d && data.d.results) {
            populateDataTable(data.d.results);
        } else {
            console.error('No results found for the selected entity.');
        }
    } catch (error) {
        handleNetworkError(error);
    }
}

function populateDataTable(results) {
    // Destroy existing DataTable if it exists
    if ($.fn.dataTable.isDataTable('#dataTable')) {
        $('#dataTable').DataTable().destroy();
        $('#dataTable tbody').empty();
    }

    // Initialize DataTable with new data
    $('#dataTable').DataTable({
        data: results,
        columns: [
            { data: 'Id', title: 'Id' },
            { data: 'FirstName', title: 'First Name' },
            { data: 'LastName', title: 'Last Name' },
            // Add more columns based on your data
        ],
        pageLength: 10,
        language: {
            url: '//cdn.datatables.net/plug-ins/1.11.5/i18n/en-gb.json'
        }
    });
}
