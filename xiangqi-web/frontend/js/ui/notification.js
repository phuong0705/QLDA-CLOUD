// frontend/js/ui/notification.js

/**
 * Simple toast/notification helper used across the frontend.
 * It creates a transient message element that fades out after a timeout.
 *
 * Usage:
 *   import { showToast } from "../ui/notification.js";
 *   showToast('Sao chép thành công!', {type: 'success'});
 */

export function showToast(message, {type = 'info', duration = 3000} = {}) {
  // Ensure a container exists (only one global container is created)
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '8px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.minWidth = '180px';
  toast.style.padding = '10px 14px';
  toast.style.borderRadius = '4px';
  toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
  toast.style.color = '#fff';
  toast.style.fontSize = '0.9rem';
  toast.style.opacity = '0';
  toast.style.transition = 'opacity 0.3s ease';

  // Color based on type
  switch (type) {
    case 'success':
      toast.style.backgroundColor = '#4caf50';
      break;
    case 'error':
      toast.style.backgroundColor = '#f44336';
      break;
    case 'warning':
      toast.style.backgroundColor = '#ff9800';
      break;
    default:
      toast.style.backgroundColor = '#607d8b'; // info / default
  }

  container.appendChild(toast);
  // trigger fade‑in
  requestAnimationFrame(() => (toast.style.opacity = '1'));

  // auto‑remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove());
  }, duration);
}

// Export as default for convenience if needed
export default { showToast };
