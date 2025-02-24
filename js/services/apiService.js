export default class ApiService {
  constructor(serverName, apiName) {
    this.serverName = serverName;
    this.apiName = apiName;
    this.credentials = sessionStorage.getItem("credentials") || null;
  }

  async request(method, endpoint, data = null) {
    const errorElement = document.getElementById("errorMessage");
    if (errorElement) errorElement.style.display = "none";

    try {
      if (!this.credentials) {
        throw new Error("No credentials found");
      }

      const headers = new Headers({
        Accept: "application/json",
        Authorization: `Basic ${this.credentials}`,
      });

      if (method !== "GET") {
        headers.append("Content-Type", "application/json");
      }

      const config = {
        method,
        headers,
        credentials: "same-origin",
      };

      if (data) {
        config.body = JSON.stringify(data);
      }

      const url = `https://${this.serverName}/${this.apiName}/${endpoint}`;

      const response = await fetch(url, config);

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


  // Method to fetch the next set of rows using the __next URL
  async fetchNextRows(nextUrl) {
    const errorElement = document.getElementById("errorMessage");
    if (errorElement) errorElement.style.display = "none";

    try {
      const headers = new Headers({
        Accept: "application/json",
        Authorization: `Basic ${this.credentials}`,
      });

      const config = {
        method: "GET",
        headers,
        credentials: "same-origin",
      };

      const response = await fetch(nextUrl, config);
      console.log("object", response);

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


    // Helper function to get the next URL
    getNextUrl(json) {
      console.log("json", json);
      let url = "";
      if (json && json.d) {
        const next = json.d.__next || (json.d.results && json.d.__next);        
        console.log("next", next);
        if (next && typeof next === "string") {
          const viewNamePos = next.lastIndexOf("/");
          if (viewNamePos >= 0) {
            url = `https://${this.serverName}/${this.apiName}` + next.substring(viewNamePos);
          }
        }
      }
      return url;
    }


  // Logout
  logout() {
    sessionStorage.removeItem("credentials");
    this.credentials = null;
    window.location.href = "/index.html";
  }


  // Helper function Handler HttpError 
  handleHttpError(status, errorData = {}) {
    const messages = {
      2: "success",
      4: "wrong or missing parameters",
      5: "for server-side errors",
      400: "Invalid request",
      401: "Authentication failed",
      403: "Access denied",
      404: "Resource not found",
      500: "Internal server error",
      503: "Service temporarily unavailable",
    };

    let message = messages[status] || `HTTP error (${status})`;

    if (errorData && errorData.error && errorData.error.message) {
      message = errorData.error.message.value || JSON.stringify(errorData);
    }
    this.showError(message, true);

    console.log(errorData);
  }

  handleNetworkError(error) {
    const message = error.message.includes("Failed to fetch")
      ? "Network error: Check your connection"
      : "Unexpected error";
    this.showError(message);
  }

  showError(message, shake = false) {
    const errorElement = document.getElementById("errorMessage");
    if (!errorElement) return;

    errorElement.innerHTML = `<div class="error-content">⚠️ ${message}</div>`;
    errorElement.style.display = "block";

    if (shake) {
      errorElement.classList.add("error-shake");
      setTimeout(() => errorElement.classList.remove("error-shake"), 500);
    }
  }
}