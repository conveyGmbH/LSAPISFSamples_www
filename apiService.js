export class ApiService {
    static async request(method, endpoint, data = null) {
        const errorElement = document.getElementById("errorMessage");
        if (errorElement) errorElement.style.display = "none";

        try {
            const credentials = sessionStorage.getItem("credentials");
            if (!credentials) {
                this.showError("Veuillez vous connecter avant d'effectuer une requête.");
                return null;
            }

            const headers = new Headers({
                "Accept": "application/json",
                "Authorization": `Basic ${credentials}`,
            });

            if (method !== "GET") {
                headers.append("Content-Type", "application/json");
            }

            const config = {
                method,
                headers,
                credentials: "same-origin",
            };

            if (data) config.body = JSON.stringify(data);

            const response = await fetch(
                `https://lstest.convey.de/apisftest/${endpoint}`,
                config
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                this.handleHttpError(response.status, errorData);
                return null;
            }

            return await response.json();
        } catch (error) {
            this.handleNetworkError(error);
            return null;
        }
    }

    static handleHttpError(status, errorData = {}) {
        const messages = {
            400: "Requête invalide : Vérifiez les paramètres",
            401: "Authentification échouée : Identifiants incorrects",
            403: "Accès refusé : Permissions insuffisantes",
            404: "Ressource introuvable",
            500: "Erreur serveur interne",
            503: "Service temporairement indisponible",
        };

        const message = errorData?.message || messages[status] || `Erreur HTTP (${status})`;

        this.showError(message, true);
    }

    static handleNetworkError(error) {
        const message = error.message.includes("Failed to fetch")
            ? "Erreur réseau : Vérifiez votre connexion internet"
            : "Erreur inattendue : Veuillez réessayer.";

        this.showError(message);
    }

    static showError(message, shake = false) {
        const errorElement = document.getElementById("errorMessage");
        if (!errorElement) return;

        errorElement.innerHTML = `
            <div class="error-content">
                <span class="error-icon">⚠️</span>
                ${message}
            </div>
        `;

        errorElement.style.display = "block";
        errorElement.scrollIntoView({ behavior: "smooth", block: "center" });

        if (shake) {
            errorElement.classList.add("error-shake");
            setTimeout(() => errorElement.classList.remove("error-shake"), 500);
        }
    }
}
