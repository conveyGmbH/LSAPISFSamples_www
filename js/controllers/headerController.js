// This module handles the header controls, including logo click and logout functionality.
document.addEventListener("DOMContentLoaded", () => {
  initHeaderControls();
});

function initHeaderControls() {
  handleClickLogo();
  handleClickLogout();
}

function getBaseUrl() {
  const currentPath = window.location.pathname;

  if (currentPath.includes("/pages/")) {
    return ".";
  } else {
    return "/pages";
  }
}

function handleClickLogo() {
  const logoDiv = document.querySelector(".logo");

  if (logoDiv) {
    logoDiv.style.cursor = "pointer";

    logoDiv.addEventListener("click", () => {
      const currentPage = window.location.pathname.split("/").pop();
      if (currentPage !== "display.html") {
        const baseUrl = getBaseUrl();
        window.location.href = `${baseUrl}/display.html`;
      }
    });
  }
}

function handleClickLogout() {
  const logoutButton = document.getElementById("logoutButton");

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      // Clear session storage
      sessionStorage.clear();

      const rootPath = window.location.pathname.includes("/pages/")
        ? "../index.html"
        : "/index.html"; // Go back to the root path

      // Redirect to login page
      window.location.href = rootPath;
    });
  }
}

// Export functions for potential reuse
export { initHeaderControls, handleClickLogo, handleClickLogout };
