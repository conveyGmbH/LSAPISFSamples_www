let dataTable = null;

async function init() {
  try {
    // Load entity sets
    const { d: { EntitySets } } = await ApiService.request('GET', '?$format=json');
    populateSelect(EntitySets);
    
    // Event listener for select
    document.getElementById('entitySelect').addEventListener('change', async (e) => {
      await loadData(e.target.value);
    });
  } catch (error) {
    console.error('Initialization error:', error);
  }
}

function populateSelect(entities) {
  const select = document.getElementById('entitySelect');
  select.innerHTML = entities.map(e => 
    `<option value="${e}">${e.replace('LS_', '')}</option>`
  ).join('');
}

async function loadData(entity) {
  try {
    const { d: { results } } = await ApiService.request('GET', `${entity}?$format=json`);
    
    // Destroy existing DataTable
    if (dataTable) dataTable.destroy();

    // Create new DataTable
    dataTable = $('#dataTable').DataTable({
      data: results,
      columns: Object.keys(results[0]).map(key => ({
        title: key,
        data: key
      })),
      paging: true,
      pageLength: 10,
      responsive: true
    });
  } catch (error) {
    console.error('Data loading error:', error);
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);