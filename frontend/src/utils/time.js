function parseDateInput(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRelativeTime(date) {
  const d = parseDateInput(date);
  if (!d) return 'Unknown';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDateTime(date) {
  const d = parseDateInput(date);
  if (!d) return 'Unknown';

  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDate(date) {
  const d = parseDateInput(date);
  if (!d) return 'Unknown';

  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatDueDate(date) {
  const d = parseDateInput(date);
  if (!d) return 'No due';

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffMs = dueStart.getTime() - todayStart.getTime();
  const days = Math.round(diffMs / 86400000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 1 && days <= 7) return `In ${days} days`;
  if (days < -1) return `${Math.abs(days)}d late`;

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
