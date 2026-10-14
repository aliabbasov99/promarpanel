// Brauzerə unikal ID (bildirişin özünə göstərilməməsi üçün)
const KEY_ID = 'promar.clientId';

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getClientId() {
  let id = localStorage.getItem(KEY_ID);
  if (!id) {
    id = uuid();
    localStorage.setItem(KEY_ID, id);
  }
  return id;
}