import { ToastManager } from './toaster.js';

export class GlobalHandlers {
  constructor() {
    const toastContainer = document.getElementById('toast-container');
    this.toaster = new ToastManager(toastContainer);
    this.addGlobalHandlers();
  }

  addGlobalHandlers() {
    // Expose validateResponse globally to allow consistent validation of fetch responses across the application.
    globalThis.validateResponse = this.validateResponse.bind(this);
    // Expose toaster globally to provide a centralized mechanism for displaying toast notifications.
    globalThis.toaster = this.toaster;
    // Expose logError globally to enable consistent error logging and toast notifications throughout the application.
    globalThis.logError = this.logError.bind(this);
    // Expose getApiBaseUrl globally to provide a centralized way to retrieve the base API URL.
    globalThis.getApiBaseUrl = this.getApiBaseUrl.bind(this);
  }

  async validateResponse(response) { // Validate the response from fetch requests
    if (!response.ok) {
      try {
        if (response.status === 401) { // Unauthorized - redirect to login
          const loginUrl = `${this.getApiBaseUrl()}/login`;
          window.location.href = loginUrl;
          response.errorMessage = 'Unauthorized access. Redirecting to login.';
          return response;
        }

        const responseData = await response.json();
        const errorMessage = responseData?.error || responseData?.message || await response.text() || response.statusText;
        response.errorMessage = errorMessage;
      } catch (error) {
          response.errorMessage = `Error parsing response: ${error.message}`;
          console.error('Error parsing response:', error.message);
        }
    }
    return response;
  }

  logError(message, error, keepOpen = false, toastTimeout = 3000) {
      let messageWithError = '';
      if (message) messageWithError += message;
      if (error) messageWithError += ` ${error}`;

      console.error(messageWithError);
      this.toaster.show(messageWithError, 'error', keepOpen, toastTimeout);
  }

  getApiBaseUrl() {
        return window.location.origin + (window.appConfig?.basePath || '');
  }
}