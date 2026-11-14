// Keep unresolved attempts across remounts/reloads. Never replace a key after a
// network error: the server may have accepted the request before the response
// was lost. Scope includes the signed-in user, rescue, trip, and exact message.
export function transportBroadcastAttempt(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  scope: string[],
  message: string,
) {
  const slot = `transport-sms-attempt:${JSON.stringify([...scope, message])}`;
  let operationKey = storage.getItem(slot);
  if (!operationKey) {
    operationKey = crypto.randomUUID();
    // Storage failure must stop submission rather than send without a key
    // that can be recovered after navigation.
    storage.setItem(slot, operationKey);
  }
  return { operationKey, finish: () => storage.removeItem(slot) };
}
