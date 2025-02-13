document.addEventListener('DOMContentLoaded', () => {
    const data = JSON.parse(sessionStorage.getItem('apiData'));

    if (data && data.d) {
        // Remplir le select
        const select = document.getElementById('dataSelect');

        if (data.d.EntitySets) {
            // Cas où la réponse contient une liste d'ensembles d'entités
            data.d.EntitySets.forEach(item => {
                const option = document.createElement('option');
                option.value = item;
                option.textContent = item;
                select.appendChild(option);
            });
        } else if (data.d.results) {
            // Cas où la réponse contient des résultats
            data.d.results.forEach(item => {
                const option = document.createElement('option');
                option.value = item.Id || item.MitarbeiterViewId || item.LGNTINITLandViewId;
                option.textContent = item.FirstName || item.Country || item.Id;
                select.appendChild(option);
            });
        }

        // Remplir la table
        if (data.d.results) {
            const table = $('#dataTable').DataTable({
                data: data.d.results,
                columns: [
                    { data: 'Id', title: 'Id' },
                    { data: 'FirstName', title: 'Prénom' },
                    { data: 'LastName', title: 'Nom' },
                    // Ajoute d'autres colonnes selon les données
                ],
                pageLength: 10,
                language: {
                    url: '//cdn.datatables.net/plug-ins/1.11.5/i18n/fr_fr.json'
                }
            });
        } else {
            console.error('Aucun résultat à afficher dans la table.');
        }
    } else {
        console.error('Aucune donnée trouvée.');
    }
});
