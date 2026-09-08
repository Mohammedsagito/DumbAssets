// Helper function to join paths with base path
export const joinPath = (path) => {
  const basePath = window.appConfig?.basePath || '';
  // Remove any leading slash from path and trailing slash from basePath
  const cleanPath = path.replace(/^\/+/, '');
  const cleanBase = basePath.replace(/\/+$/, '');
  
  // Join with single slash
  return cleanBase ? `${cleanBase}/${cleanPath}` : cleanPath;
};