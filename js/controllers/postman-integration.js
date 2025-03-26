(function addPostmanStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        /* Postman button styles */
        .postman-button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--primary-color);
            padding: 4px 8px;
            border-radius: 4px;
            border: none;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            vertical-align: middle;
            margin-left: 4px;
        }

        .postman-button:hover {
            background-color: var(--light-gray);
        }

        /* Modal styles */
        .postman-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .postman-modal-content {
            background-color: white;
            border-radius: 8px;
            width: 90%;
            max-width: 450px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
            overflow: hidden;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #eee;
        }

        .modal-header h2 {
            margin: 0;
            font-size: 18px;
            color: #333;
        }

        .close-button {
            background: none;
            border: none;
            font-size: 24px;
            color: #999;
            cursor: pointer;
        }

        .close-button:hover {
            color: #333;
        }

        .modal-description {
            padding: 20px;
            color: #555;
            line-height: 1.5;
            margin: 0;
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            padding: 16px 20px;
            gap: 12px;
            border-top: 1px solid #eee;
        }

        .cancel-button {
            background: none;
            border: none;
            padding: 8px 16px;
            font-size: 14px;
            color: #555;
            cursor: pointer;
            border-radius: 4px;
        }

        .cancel-button:hover {
            background-color: #f5f5f5;
        }

        .download-button, .open-postman-button {
            display: flex;
            align-items: center;
            gap: 8px;
            background-color: #FF6C37;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
        }

        .download-button:hover, .open-postman-button:hover {
            background-color: #E05320;
        }
    `;
    document.head.appendChild(styleEl);
})();

// Main function to initialize Postman integration
document.addEventListener('DOMContentLoaded', function() {
    const postmanButton = document.getElementById('postmanButton');
    
    if (postmanButton) {
        postmanButton.addEventListener('click', function() {
            // Create and display modal
            const modal = document.createElement('div');
            modal.className = 'postman-modal';
            modal.innerHTML = `
                <div class="postman-modal-content">
                    <div class="modal-header">
                        <h2>LeadSuccess API Collection</h2>
                        <button id="closeModalBtn" class="close-button">&times;</button>
                    </div>
                    <p class="modal-description">
                        Click the button below to download our API collection.
                        You can import this file into Postman to test all API endpoints.
                    </p>
                    <div class="modal-footer">
                        <button id="cancelBtn" class="cancel-button">Cancel</button>
                        <button id="downloadBtn" class="download-button">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Download Collection
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Close modal buttons
            document.getElementById('closeModalBtn').addEventListener('click', function() {
                modal.remove();
            });
            
            document.getElementById('cancelBtn').addEventListener('click', function() {
                modal.remove();
            });
            
            // Download collection button
            document.getElementById('downloadBtn').addEventListener('click', function() {
                // Path to JSON collection file
                const jsonFileUrl = `${window.location.origin}/postman/LeadSuccess-API-Collection.json`;
                
                // Create download link
                const downloadLink = document.createElement('a');
                downloadLink.href = jsonFileUrl;
                downloadLink.download = 'LeadSuccess-API-Collection.json';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                // Change modal content after download
                const modalContent = document.querySelector('.postman-modal-content');
                modalContent.innerHTML = `
                    <div class="modal-header">
                        <h2>Collection Downloaded</h2>
                        <button id="closeModalAfterBtn" class="close-button">&times;</button>
                    </div>
                    <p class="modal-description">
                        The collection has been downloaded successfully.
                        Would you like to open Postman now?
                    </p>
                    <div class="modal-footer">
                        <button id="closeBtn" class="cancel-button">Close</button>
                        <button id="openPostmanBtn" class="open-postman-button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                            </svg>
                            Open Postman
                        </button>
                    </div>
                `;
                
                // Add event listeners for the new buttons
                document.getElementById('closeModalAfterBtn').addEventListener('click', function() {
                    modal.remove();
                });
                
                document.getElementById('closeBtn').addEventListener('click', function() {
                    modal.remove();
                });
                
                document.getElementById('openPostmanBtn').addEventListener('click', function() {
                    // Try to open Postman application
                    window.location.href = 'postman://';
                    
                    // Close the modal
                    setTimeout(function() {
                        modal.remove();
                    }, 1000);
                });
            });
        });
    }
});